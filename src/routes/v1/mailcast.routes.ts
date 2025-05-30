// src/routes/v1/mailcast.routes.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createMailcastHandlers } from '../../handlers/mailcast.handler';
import { sendMailcastMessageSchema } from '../../schemas/mailcast.schema';

const mailcastRoutes: FastifyPluginAsync = async (fastify) => {
  const handlers = createMailcastHandlers({
    taskRepository: fastify.taskRepository,
    agenda: fastify.agenda,
    publishEvent: fastify.publishEvent,
    log: fastify.log
  });

  fastify.post('/mailcast/send-message', {
    schema: sendMailcastMessageSchema,
    handler: handlers.sendMessage,
  });
};

export default fp(mailcastRoutes);
