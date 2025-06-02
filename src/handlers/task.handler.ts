// src/handlers/task.handler.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { ObjectId } from 'mongodb';
import { TaskRepository } from '../repositories/task.repository';
import { TaskFiltersInput, TaskUpdateInput } from '../schemas/zod-schemas';
import { Task, TaskStatus, TaskAgent, TaskType } from '../models/task';
import { sendSuccess, sendError, createPaginationMeta } from '../utils/response';
import { badRequest, notFound, unauthorized, handleError } from '../utils/errors';

export interface TaskHandlerDeps {
  taskRepository: TaskRepository;
}

export const createTaskHandlers = (deps: TaskHandlerDeps) => {
  const { taskRepository } = deps;

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
        taskType,    // Updated from 'channel' and 'type'
        taskAgent,   // Updated from 'channel'
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
        taskType: taskType as TaskType,      // Updated
        taskAgent: taskAgent as TaskAgent,   // Updated
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

      if (payload.label !== undefined) {
        updates.label = payload.label;
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

  // New handlers for specific task types
  const getChatTasks = async (
    request: FastifyRequest<{ 
      Querystring: { 
        agentId?: string; 
        taskAgent?: TaskAgent; 
        limit?: number; 
        skip?: number; 
      } 
    }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = request.user?.company;
      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      const { agentId, taskAgent, limit = 20, skip = 0 } = request.query;

      const tasks = await taskRepository.findChatTasks(
        companyId,
        agentId,
        taskAgent,
        { limit: Number(limit), skip: Number(skip) }
      );

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
    request: FastifyRequest<{ 
      Querystring: { 
        agentId?: string; 
        taskAgent?: TaskAgent; 
        limit?: number; 
        skip?: number; 
      } 
    }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = request.user?.company;
      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      const { agentId, taskAgent, limit = 20, skip = 0 } = request.query;

      const tasks = await taskRepository.findBroadcastTasks(
        companyId,
        agentId,
        taskAgent,
        { limit: Number(limit), skip: Number(skip) }
      );

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
    request: FastifyRequest<{ 
      Querystring: { 
        agentId?: string; 
        taskAgent?: TaskAgent; 
        limit?: number; 
        skip?: number; 
      } 
    }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = request.user?.company;
      if (!companyId) {
        throw unauthorized('No company ID found');
      }

      const { agentId, taskAgent, limit = 20, skip = 0 } = request.query;

      const tasks = await taskRepository.findMailcastTasks(
        companyId,
        agentId,
        taskAgent,
        { limit: Number(limit), skip: Number(skip) }
      );

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

  const getTaskStats = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
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
    updateTask,
    // New handlers
    getChatTasks,
    getBroadcastTasks,
    getMailcastTasks,
    getTaskStats,
  };
};