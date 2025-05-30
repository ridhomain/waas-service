// src/plugins/mongodb.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifyMongo from '@fastify/mongodb';
import { createTaskRepository } from '../repositories/task.repository';

const mongodbPlugin: FastifyPluginAsync = async (fastify) => {
  // Register MongoDB connection
  await fastify.register(fastifyMongo, {
    forceClose: true,
    url: fastify.config.MONGODB_DSN,
  });

  const db = fastify.mongo.db;
  if (!db) {
    fastify.log.error('MongoDB failed to connect — db not available.');
    throw new Error('MongoDB not connected');
  }

  // Ensure required indexes
  const tasks = db.collection('tasks');
  
  try {
    await Promise.all([
      tasks.createIndex({ companyId: 1 }),
      tasks.createIndex({ companyId: 1, agentId: 1 }),
      tasks.createIndex({ status: 1, channel: 1 }),
      tasks.createIndex({ scheduledAt: 1 }),
      // tasks.createIndex({ batchId: 1 }),
      // tasks.createIndex({ createdAt: -1 }),
    ]);
    
    fastify.log.info('MongoDB indexes created successfully');
  } catch (error) {
    fastify.log.error(error, 'Failed to create MongoDB indexes');
    throw error;
  }

  // Create and register repository
  const taskRepository = createTaskRepository(db);
  fastify.decorate('taskRepository', taskRepository);

  fastify.log.info('MongoDB connected and task repository initialized');
};

export default fp(mongodbPlugin, {
  name: 'mongodb',
  dependencies: ['config'],
});