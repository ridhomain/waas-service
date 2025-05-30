// src/routes/v1/task.routes.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { createTaskHandlers } from '../../handlers/task.handler';
import { TaskFiltersSchema, TaskUpdateSchema } from '../../schemas/zod-schemas';

const TaskParamsSchema = z.object({
  id: z.string().min(1, 'Task ID is required'),
});

const taskRoutes: FastifyPluginAsync = async (fastify) => {
  const handlers = createTaskHandlers({
    taskRepository: fastify.taskRepository,
  });

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
};

export default fp(taskRoutes);