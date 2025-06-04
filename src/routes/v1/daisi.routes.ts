// src/routes/v1/daisi.routes.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createDaisiHandlers } from '../../handlers/daisi.handler';
import {
  DaisiSendMessageSchema,
  DaisiSendGroupMessageSchema,
  DaisiMarkAsReadSchema,
  DaisiLogoutSchema,
  DaisiDownloadMediaSchema,
} from '../../schemas/zod-schemas';

const daisiRoutes: FastifyPluginAsync = async (fastify) => {
  const handlers = createDaisiHandlers({
    taskRepository: fastify.taskRepository,
    agenda: fastify.agenda,
    requestAgentEvent: fastify.requestAgentEvent,
    log: fastify.log,
  });

  fastify.post('/daisi/send-message', {
    preHandler: [fastify.zodValidate({ body: DaisiSendMessageSchema })],
    handler: handlers.sendMessage,
  });

  fastify.post('/daisi/send-message-to-group', {
    preHandler: [fastify.zodValidate({ body: DaisiSendGroupMessageSchema })],
    handler: handlers.sendMessageToGroup,
  });

  fastify.post('/daisi/mark-as-read', {
    preHandler: [fastify.zodValidate({ body: DaisiMarkAsReadSchema })],
    handler: handlers.markAsRead,
  });

  fastify.post('/daisi/logout', {
    preHandler: [fastify.zodValidate({ body: DaisiLogoutSchema })],
    handler: handlers.logout,
  });

  fastify.post('/daisi/download-media', {
    preHandler: [fastify.zodValidate({ body: DaisiDownloadMediaSchema })],
    handler: handlers.downloadMedia,
  });
};

export default fp(daisiRoutes);
