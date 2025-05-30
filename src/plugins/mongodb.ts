import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifyMongo from '@fastify/mongodb';
import { TaskService } from '../services/task.service';

const mongodbPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyMongo, {
    forceClose: true,
    url: fastify.config.MONGODB_DSN,
  });

  const db = fastify.mongo.db;

  if (!db) {
    fastify.log.error('MongoDB failed to connect — db not available.');
    throw new Error('MongoDB not connected');
  }

  // Ensure required indexes for task collection
  const tasks = db.collection('tasks');

  await tasks.createIndex({ companyId: 1 });  
  await tasks.createIndex({ companyId: 1, agentId: 1 });
  await tasks.createIndex({ status: 1, channel: 1 });
  await tasks.createIndex({ scheduledAt: 1 });

  fastify.log.info('MongoDB connected and task indexes ensured');

  // Decorate taskService
  const taskService = new TaskService(db);
  fastify.decorate('taskService', taskService);
};

export default fp(mongodbPlugin);