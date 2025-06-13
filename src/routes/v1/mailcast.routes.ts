// src/routes/v1/mailcast.routes.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createMailcastHandlers } from '../../handlers/mailcast.handler';
import { MailcastSendMessageSchema } from '../../schemas/zod-schemas';

const mailcastRoutes: FastifyPluginAsync = async (fastify) => {
  const handlers = createMailcastHandlers({
    taskRepository: fastify.taskRepository,
    agenda: fastify.agenda,
    log: fastify.log,
  });

  fastify.post('/mailcast/send-message', {
    preHandler: [fastify.zodValidate({ body: MailcastSendMessageSchema })],
    handler: handlers.sendMessage,
  });
};

export default fp(mailcastRoutes);
