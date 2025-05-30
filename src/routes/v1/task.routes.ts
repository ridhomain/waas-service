// src/routes/v1/task.routes.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createTaskHandlers } from '../../handlers/task.handler';
import {
  listTasksSchema,
  getTaskByIdSchema,
  patchTaskByIdSchema,
} from '../../schemas/task.schema';

const taskRoutes: FastifyPluginAsync = async (fastify) => {
  const handlers = createTaskHandlers({
    taskRepository: fastify.taskRepository,
  });

  fastify.get('/tasks', {
    schema: listTasksSchema,
    handler: handlers.listTasks,
  });

  fastify.get('/tasks/:id', {
    schema: getTaskByIdSchema,
    handler: handlers.getTaskById,
  });

  fastify.patch('/tasks/:id', {
    schema: patchTaskByIdSchema,
    handler: handlers.updateTask,
  });
};

export default fp(taskRoutes);
