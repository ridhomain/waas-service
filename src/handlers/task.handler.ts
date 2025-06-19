// src/handlers/task.handler.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { ObjectId } from 'mongodb';
import { JetStreamClient } from 'nats';
import { Agenda } from '@hokify/agenda';
import { TaskRepository } from '../repositories/task.repository';
import {
  TaskFiltersInput,
  TaskUpdateInput,
  TaskTypeQueryInput,
  RescheduleTaskInput,
} from '../schemas/zod-schemas';
import { Task, TaskStatus, TaskAgent, TaskType } from '../models/task';
import { sendSuccess, sendError, createPaginationMeta } from '../utils/response';
import {
  badRequest,
  notFound,
  unauthorized,
  handleError,
  AppError,
  internalError,
} from '../utils/errors';

export interface TaskHandlerDeps {
  taskRepository: TaskRepository;
  agenda: Agenda;
  js?: JetStreamClient;
  log: any;
}

export const createTaskHandlers = (deps: TaskHandlerDeps) => {
  const { taskRepository, agenda, log } = deps;

  const listTasks = async (
    request: FastifyRequest<{ Querystring: TaskFiltersInput }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = request.user?.company;
      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      const {
        status,
        taskType,
        taskAgent,
        label,
        agentId,
        limit = 20,
        skip = 0,
        page,
        scheduledBefore,
      } = request.query;

      // Convert page to skip if provided
      const actualSkip = page ? (page - 1) * limit : skip;

      const filters = {
        status: status as TaskStatus,
        taskType: taskType as TaskType,
        taskAgent: taskAgent as TaskAgent,
        label,
        agentId,
        scheduledBefore: scheduledBefore ? new Date(scheduledBefore) : undefined,
      };

      const [tasks, total] = await Promise.all([
        taskRepository.findByCompany(companyId, filters, {
          limit: Number(limit),
          skip: Number(actualSkip),
        }),
        taskRepository.countByCompany(companyId, filters),
      ]);

      // Transform tasks to include id field
      const transformedTasks = tasks.map((task) => ({
        ...task,
        id: task._id?.toString(),
        _id: undefined,
      }));

      const currentPage = page || Math.floor(actualSkip / limit) + 1;
      const meta = createPaginationMeta(total, currentPage, Number(limit));

      return sendSuccess(reply, transformedTasks, 200, meta);
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const getNextPendingTask = async (
    request: FastifyRequest<{ Params: { batchId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { batchId } = request.params;
      const userCompany = request.user?.company;

      if (!userCompany) {
        throw unauthorized('No company ID found');
      }

      // Get next pending task from the batch
      const task = await taskRepository.findNextPendingByBatch(batchId);

      if (!task) {
        throw notFound('No pending tasks in batch');
      }

      // Verify task belongs to user's company
      if (task.companyId !== userCompany) {
        throw notFound('Batch not found');
      }

      // Transform task to include id field
      const transformedTask = {
        ...task,
        id: task._id?.toString(),
        _id: task._id?.toString(), // Keep _id for backward compatibility
      };

      return sendSuccess(reply, { task: transformedTask });
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const getTaskById = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { id } = request.params;
      const companyId = request.user?.company;

      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      if (!ObjectId.isValid(id)) {
        throw badRequest('Invalid task ID format');
      }

      const task = await taskRepository.findById(id);

      if (!task) {
        throw notFound('Task');
      }

      // Verify task belongs to user's company
      if (task.companyId !== companyId) {
        throw notFound('Task');
      }

      return sendSuccess(reply, {
        ...task,
        id: task._id?.toString(),
        _id: undefined,
      });
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const updateTask = async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: TaskUpdateInput;
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { id } = request.params;
      const payload = request.body;
      const companyId = request.user?.company;

      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      if (!ObjectId.isValid(id)) {
        throw badRequest('Invalid task ID format');
      }

      // Verify task exists and belongs to company
      const existingTask = await taskRepository.findById(id);
      if (!existingTask) {
        throw notFound('Task');
      }

      if (existingTask.companyId !== companyId) {
        throw notFound('Task');
      }

      // Build updates object (Zod validation already ensures valid values)
      const updates: Partial<Task> = {};
      if (payload.status) {
        updates.status = payload.status as TaskStatus;
      }

      // if (payload.label !== undefined) {
      //   updates.label = payload.label;
      // }

      const updated = await taskRepository.update(id, updates);

      if (!updated) {
        throw badRequest('Failed to update task');
      }

      return sendSuccess(reply, { id, updated: true });
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const rescheduleTask = async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: RescheduleTaskInput;
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { id } = request.params;
      const { scheduleAt, reason, metadata } = request.body;
      const companyId = request.user?.company;

      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      if (!ObjectId.isValid(id)) {
        throw badRequest('Invalid task ID format');
      }

      const existingTask = await taskRepository.findById(id);
      if (!existingTask) {
        throw notFound('Task');
      }

      if (existingTask.companyId !== companyId) {
        throw notFound('Task');
      }

      if (existingTask.status !== 'PENDING') {
        throw badRequest(
          `Cannot reschedule task with status ${existingTask.status}. Only PENDING tasks can be rescheduled.`,
          'INVALID_STATUS'
        );
      }

      if (existingTask.taskType !== 'mailcast') {
        throw badRequest(
          'Only mailcast tasks can be rescheduled at this time',
          'UNSUPPORTED_TASK_TYPE'
        );
      }

      const newScheduleDate = new Date(scheduleAt);
      const now = new Date();

      if (newScheduleDate <= now) {
        throw badRequest('New schedule date must be in the future', 'INVALID_SCHEDULE_DATE');
      }

      try {
        // Alternative: Cancel by finding jobs with taskId in data
        const cancelCount = await agenda.cancel({
          name: 'send-mailcast-message',
          'data.taskId': id,
        });

        if (cancelCount === 0) {
          log.warn({ taskId: id }, 'No agenda job found to cancel');
        }

        // Prepare job data
        const jobData = {
          companyId: existingTask.companyId,
          agentId: existingTask.agentId,
          phoneNumber: existingTask.phoneNumber,
          message: existingTask.message,
          options: existingTask.options,
          variables: existingTask.variables,
          userId: existingTask.userId,
          label: existingTask.label,
          metadata: existingTask.metadata,
          taskId: id,
        };

        const jobName = 'send-mailcast-message';
        const newJob = await agenda.schedule(newScheduleDate, jobName, jobData);

        const newJobId = newJob.attrs._id?.toString();
        if (!newJobId) {
          throw internalError('Failed to create new scheduled job');
        }

        // Update task
        const updateData: Partial<Task> = {
          scheduledAt: newScheduleDate,
          agendaJobId: newJobId,
          metadata: {
            ...existingTask.metadata,
            ...metadata,
            rescheduleHistory: [
              ...(existingTask.metadata?.rescheduleHistory || []),
              {
                from: existingTask.scheduledAt,
                to: newScheduleDate,
                reason,
                rescheduledAt: new Date(),
                rescheduledBy: request.user?.company,
              },
            ],
          },
        };

        const updated = await taskRepository.update(id, updateData);

        if (!updated) {
          // Rollback
          await agenda.cancel({ 'data.taskId': id });
          throw internalError('Failed to update task');
        }

        log.info(
          {
            taskId: id,
            oldSchedule: existingTask.scheduledAt,
            newSchedule: newScheduleDate,
            reason,
          },
          'Task rescheduled successfully'
        );

        const updatedTask = await taskRepository.findById(id);
        if (!updatedTask) {
          throw internalError('Failed to retrieve updated task');
        }

        return sendSuccess(reply, {
          id: updatedTask._id?.toString(),
          companyId: updatedTask.companyId,
          agentId: updatedTask.agentId,
          phoneNumber: updatedTask.phoneNumber,
          message: updatedTask.message,
          taskType: updatedTask.taskType,
          taskAgent: updatedTask.taskAgent,
          status: updatedTask.status,
          scheduledAt: updatedTask.scheduledAt,
          agendaJobId: updatedTask.agendaJobId,
          metadata: updatedTask.metadata,
          createdAt: updatedTask.createdAt,
          updatedAt: updatedTask.updatedAt,
        });
      } catch (agendaError) {
        log.error({ err: agendaError, taskId: id }, 'Failed to reschedule agenda job');

        if (agendaError instanceof AppError) {
          throw agendaError;
        }

        throw internalError('Failed to reschedule task', 'AGENDA_ERROR');
      }
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  // Helper function to determine job name
  // function getJobNameForTask(task: Task): string {
  //   switch (`${task.taskType}-${task.taskAgent}`) {
  //     case 'mailcast-DAISI':
  //     case 'mailcast-META':
  //       return 'send-mailcast-message';
  //     default:
  //       return 'unknown-job';
  //   }
  // }

  // New handlers for specific task types
  const getChatTasks = async (
    request: FastifyRequest<{ Querystring: TaskTypeQueryInput }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = request.user?.company;
      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      const { agentId, taskAgent, limit = 20, skip = 0 } = request.query;

      const tasks = await taskRepository.findChatTasks(companyId, agentId, taskAgent, {
        limit: Number(limit),
        skip: Number(skip),
      });

      const transformedTasks = tasks.map((task) => ({
        ...task,
        id: task._id?.toString(),
        _id: undefined,
      }));

      return sendSuccess(reply, transformedTasks);
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const getBroadcastTasks = async (
    request: FastifyRequest<{ Querystring: TaskTypeQueryInput }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = request.user?.company;
      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      const { agentId, taskAgent, limit = 20, skip = 0 } = request.query;

      const tasks = await taskRepository.findBroadcastTasks(companyId, agentId, taskAgent, {
        limit: Number(limit),
        skip: Number(skip),
      });

      const transformedTasks = tasks.map((task) => ({
        ...task,
        id: task._id?.toString(),
        _id: undefined,
      }));

      return sendSuccess(reply, transformedTasks);
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const getMailcastTasks = async (
    request: FastifyRequest<{ Querystring: TaskTypeQueryInput }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = request.user?.company;
      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      const { agentId, taskAgent, limit = 20, skip = 0 } = request.query;

      const tasks = await taskRepository.findMailcastTasks(companyId, agentId, taskAgent, {
        limit: Number(limit),
        skip: Number(skip),
      });

      const transformedTasks = tasks.map((task) => ({
        ...task,
        id: task._id?.toString(),
        _id: undefined,
      }));

      return sendSuccess(reply, transformedTasks);
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const getTaskStats = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const companyId = request.user?.company;
      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      const stats = await taskRepository.getTaskStats(companyId);
      return sendSuccess(reply, stats);
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  return {
    listTasks,
    getTaskById,
    getNextPendingTask,
    updateTask,
    getChatTasks,
    getBroadcastTasks,
    getMailcastTasks,
    getTaskStats,
    rescheduleTask,
  };
};
