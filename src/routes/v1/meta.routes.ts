// src/routes/v1/meta.routes.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createMetaHandlers } from '../../handlers/meta.handler';
import { sendMetaMessageSchema } from '../../schemas/meta.schema';

const metaRoutes: FastifyPluginAsync = async (fastify) => {
  const handlers = createMetaHandlers({
    agenda: fastify.agenda,
  });

  fastify.post('/meta/send-message', {
    schema: sendMetaMessageSchema,
    handler: handlers.sendMessage,
  });
};

export default fp(metaRoutes);
