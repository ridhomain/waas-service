import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { listTasks, getTaskById, patchTaskById } from '../../handlers/task';
import {
  listTasksSchema,
  getTaskByIdSchema,
  patchTaskByIdSchema,
} from '../../schemas/task-schema';

const taskRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/tasks', { schema: listTasksSchema }, listTasks);
  fastify.get('/tasks/:id', { schema: getTaskByIdSchema }, getTaskById);
  fastify.patch('/tasks/:id', { schema: patchTaskByIdSchema }, patchTaskById);
};

export default fp(taskRoutes);