// src/routes/v1/task.routes.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { createTaskHandlers } from '../../handlers/task.handler';
import {
  TaskFiltersSchema,
  TaskUpdateSchema,
  TaskTypeQuerySchema,
  RescheduleTaskSchema,
} from '../../schemas/zod-schemas';

const TaskParamsSchema = z.object({
  id: z.string().min(1, 'Task ID is required'),
});

const BatchIdParamsSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
});

const taskRoutes: FastifyPluginAsync = async (fastify) => {
  const handlers = createTaskHandlers({
    taskRepository: fastify.taskRepository,
    agenda: fastify.agenda,
    log: fastify.log,
  });

  // General task management
  // GET /tasks - List tasks with filters
  fastify.get('/tasks', {
    preHandler: [fastify.zodValidate({ querystring: TaskFiltersSchema })],
    handler: handlers.listTasks,
  });

  // GET /tasks/:id - Get specific task
  fastify.get('/tasks/:id', {
    preHandler: [fastify.zodValidate({ params: TaskParamsSchema })],
    handler: handlers.getTaskById,
  });

  // PATCH /tasks/:id - Update task
  fastify.patch('/tasks/:id', {
    preHandler: [
      fastify.zodValidate({
        params: TaskParamsSchema,
        body: TaskUpdateSchema,
      }),
    ],
    handler: handlers.updateTask,
  });

  fastify.patch('/tasks/:id/reschedule', {
    preHandler: [
      fastify.zodValidate({
        params: TaskParamsSchema,
        body: RescheduleTaskSchema,
      }),
    ],
    handler: handlers.rescheduleTask,
  });

  // Task type-specific endpoints
  // GET /tasks/chat - Get chat tasks (taskType: 'chat')
  fastify.get('/tasks/chat', {
    preHandler: [fastify.zodValidate({ querystring: TaskTypeQuerySchema })],
    handler: handlers.getChatTasks,
  });

  // GET /tasks/broadcast - Get broadcast tasks (taskType: 'broadcast')
  fastify.get('/tasks/broadcast', {
    preHandler: [fastify.zodValidate({ querystring: TaskTypeQuerySchema })],
    handler: handlers.getBroadcastTasks,
  });

  // GET /tasks/mailcast - Get mailcast tasks (taskType: 'mailcast')
  fastify.get('/tasks/mailcast', {
    preHandler: [fastify.zodValidate({ querystring: TaskTypeQuerySchema })],
    handler: handlers.getMailcastTasks,
  });

  // GET /tasks/stats - Get task statistics
  fastify.get('/tasks/stats', {
    handler: handlers.getTaskStats,
  });

  fastify.get('/tasks/next-pending/:batchId', {
    preHandler: [fastify.zodValidate({ params: BatchIdParamsSchema })],
    handler: handlers.getNextPendingTask,
  });
};

export default fp(taskRoutes);
