import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

// import broadcastRoutes from './v1/broadcast-routes.js';
// import workerRoutes from './v1/worker-routes.js';
import healthRoutes from './v1/health-routes';
import metaRoutes from './v1/meta-routes';
import daisiRoutes from './v1/daisi-routes';
import mailcastRoutes from './v1/mailcast-routes';
import taskRoutes from './v1/task-routes';

const apiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Public routes
  await fastify.register(healthRoutes, { prefix: '/api/v1' });

  // Authenticated routes
  await fastify.register(
    async (fastify: FastifyInstance) => {
      fastify.addHook('preHandler', fastify.authenticate);
      fastify.register(metaRoutes);
      fastify.register(daisiRoutes);
      fastify.register(mailcastRoutes);
      fastify.register(taskRoutes);
    },
    { prefix: '/api/v1' }
  );
};

export default fp(apiRoutes);
