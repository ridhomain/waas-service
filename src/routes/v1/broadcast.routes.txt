// src/routes/v1/broadcast.routes.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createBroadcastHandlers } from '../../handlers/broadcast.handler';
import {
  BroadcastByTagsSchema,
  BroadcastByPhonesSchema,
  BroadcastPreviewSchema,
  BroadcastStatusSchema,
  CancelBroadcastSchema,
} from '../../schemas/zod-schemas';

const broadcastRoutes: FastifyPluginAsync = async (fastify) => {
  const handlers = createBroadcastHandlers({
    taskRepository: fastify.taskRepository,
    agenda: fastify.agenda,
    js: fastify.js,
    pg: fastify.pg,
    publishEvent: fastify.publishEvent,
    log: fastify.log,
  });

  // Create broadcasts
  fastify.post('/daisi/broadcast/by-tags', {
    preHandler: [fastify.zodValidate({ body: BroadcastByTagsSchema })],
    handler: handlers.broadcastByTags,
  });

  fastify.post('/daisi/broadcast/by-phones', {
    preHandler: [fastify.zodValidate({ body: BroadcastByPhonesSchema })],
    handler: handlers.broadcastByPhones,
  });

  // Preview broadcast
  fastify.post('/daisi/broadcast/preview', {
    preHandler: [fastify.zodValidate({ body: BroadcastPreviewSchema })],
    handler: handlers.previewBroadcast,
  });

  // Get broadcast status
  fastify.get('/daisi/broadcast/:batchId/status', {
    preHandler: [fastify.zodValidate({ params: BroadcastStatusSchema })],
    handler: handlers.getBroadcastStatus,
  });

  // Cancel broadcast
  fastify.delete('/daisi/broadcast/:batchId', {
    preHandler: [fastify.zodValidate({ params: CancelBroadcastSchema })],
    handler: handlers.cancelBroadcast,
  });
};

export default fp(broadcastRoutes);