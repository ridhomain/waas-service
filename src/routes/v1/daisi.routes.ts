// src/routes/v1/daisi.routes.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createDaisiHandlers } from '../../handlers/daisi.handler';
import {
  sendDaisiMessageSchema,
  sendDaisiMessageToGroupSchema,
  markAsReadSchema,
  logoutSchema,
} from '../../schemas/daisi.schema';

const daisiRoutes: FastifyPluginAsync = async (fastify) => {
  const handlers = createDaisiHandlers({
    taskRepository: fastify.taskRepository,
    agenda: fastify.agenda,
    requestAgentEvent: fastify.requestAgentEvent,
  });

  fastify.post('/daisi/send-message', {
    schema: sendDaisiMessageSchema,
    handler: handlers.sendMessage,
  });

  fastify.post('/daisi/send-message-to-group', {
    schema: sendDaisiMessageToGroupSchema,
    handler: handlers.sendMessageToGroup,
  });

  fastify.post('/daisi/mark-as-read', {
    schema: markAsReadSchema,
    handler: handlers.markAsRead,
  });

  fastify.post('/daisi/logout', {
    schema: logoutSchema,
    handler: handlers.logout,
  });
};

export default fp(daisiRoutes);
