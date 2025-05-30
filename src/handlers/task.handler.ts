// src/handlers/task.handler.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { ObjectId } from 'mongodb';
import { TaskRepository } from '../repositories/task.repository';
import { TaskFilterQuery } from '../types/api.types';
import { Task, TaskStatus, TaskChannel } from '../models/task';
import { sendSuccess, sendError, createPaginationMeta } from '../utils/response';
import { badRequest, notFound, unauthorized, handleError } from '../utils/errors';

export interface TaskHandlerDeps {
  taskRepository: TaskRepository;
}

export const createTaskHandlers = (deps: TaskHandlerDeps) => {
  const { taskRepository } = deps;

  const listTasks = async (
    request: FastifyRequest<{ Querystring: TaskFilterQuery }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = request.user?.company;
      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      const {
        status,
        channel,
        type,
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
        channel: channel as TaskChannel,
        taskType: type,
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
      Body: Partial<Pick<Task, 'status' | 'label'>>;
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

      // Validate update payload
      const updates: Partial<Task> = {};
      if (payload.status) {
        const validStatuses: TaskStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'ERROR'];
        if (!validStatuses.includes(payload.status as TaskStatus)) {
          throw badRequest('Invalid status value');
        }
        updates.status = payload.status as TaskStatus;
      }

      if (payload.label !== undefined) {
        updates.label = payload.label;
      }

      if (Object.keys(updates).length === 0) {
        throw badRequest('No valid fields to update');
      }

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

  return {
    listTasks,
    getTaskById,
    updateTask,
  };
};