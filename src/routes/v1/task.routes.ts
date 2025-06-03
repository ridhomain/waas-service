// src/routes/v1/task.routes.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { createTaskHandlers } from '../../handlers/task.handler';
import { TaskFiltersSchema, TaskUpdateSchema, TaskTypeQuerySchema } from '../../schemas/zod-schemas';

const TaskParamsSchema = z.object({
  id: z.string().min(1, 'Task ID is required'),
});

const taskRoutes: FastifyPluginAsync = async (fastify) => {
  const handlers = createTaskHandlers({
    taskRepository: fastify.taskRepository,
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
        body: TaskUpdateSchema 
      })
    ],
    handler: handlers.updateTask,
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
};

export default fp(taskRoutes);