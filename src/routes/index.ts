// src/routes/index.ts
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import healthRoutes from './v1/health.routes';
import metaRoutes from './v1/meta.routes';
import daisiRoutes from './v1/daisi.routes';
import mailcastRoutes from './v1/mailcast.routes';
import taskRoutes from './v1/task.routes';
import broadcastRoutes from './v1/broadcast.routes';

const apiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Public routes
  await fastify.register(healthRoutes, { prefix: '/api/v1' });

  // Authenticated routes
  await fastify.register(
    async (fastify: FastifyInstance) => {
      // Add authentication hook
      fastify.addHook('preHandler', fastify.authenticate);
      
      // Register routes
      await fastify.register(metaRoutes);
      await fastify.register(daisiRoutes);
      await fastify.register(mailcastRoutes);
      await fastify.register(taskRoutes);
      await fastify.register(broadcastRoutes);
    },
    { prefix: '/api/v1' }
  );
};

export default fp(apiRoutes);