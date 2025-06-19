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

  // Ensure required indexes with updated task fields
  const tasks = db.collection('tasks');

  try {
    await Promise.all([
      // Core indexes
      tasks.createIndex({ companyId: 1 }),
      tasks.createIndex({ companyId: 1, agentId: 1 }),

      // Updated indexes for new task structure
      tasks.createIndex({ taskType: 1, taskAgent: 1 }),
      tasks.createIndex({ companyId: 1, taskType: 1 }),
      tasks.createIndex({ companyId: 1, taskAgent: 1 }),
      tasks.createIndex({ companyId: 1, taskType: 1, taskAgent: 1 }),

      // Status and scheduling indexes
      tasks.createIndex({ status: 1 }),
      tasks.createIndex({ scheduledAt: 1 }),
      tasks.createIndex({ status: 1, scheduledAt: 1 }),

      // Batch operations
      tasks.createIndex({ batchId: 1, status: 1, createdAt: 1 }),
      tasks.createIndex({ companyId: 1, batchId: 1 }),

      // Query performance indexes
      tasks.createIndex({ createdAt: -1 }),
      tasks.createIndex({ updatedAt: -1 }),
      tasks.createIndex({ companyId: 1, createdAt: -1 }),

      // Agent-specific queries
      tasks.createIndex({ agentId: 1, status: 1 }),
      tasks.createIndex({ agentId: 1, taskType: 1, status: 1 }),

      // Label-based filtering
      // tasks.createIndex({ companyId: 1, label: 1 }),

      // Cleanup and analytics indexes
      tasks.createIndex({ finishedAt: 1 }),
      tasks.createIndex({ companyId: 1, status: 1, finishedAt: 1 }),
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
  dependencies: ['env'],
});
