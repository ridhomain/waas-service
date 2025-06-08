// src/routes/v1/multi-agent-broadcast.routes.ts

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createMultiAgentBroadcastHandlers } from '../../handlers/multi-agent-broadcast.handler';
import { 
  MultiAgentBroadcastSchema, 
  MultiAgentBroadcastPreviewSchema 
} from '../../schemas/zod-schemas';

const multiAgentBroadcastRoutes: FastifyPluginAsync = async (fastify) => {
  const handlers = createMultiAgentBroadcastHandlers({
    taskRepository: fastify.taskRepository,
    agenda: fastify.agenda,
    js: fastify.js,
    pg: fastify.pg,
    publishEvent: fastify.publishEvent,
    log: fastify.log,
  });

  // Preview multi-agent broadcast
  fastify.post('/broadcast/multi-agent/preview', {
    preHandler: [
      fastify.authenticate, 
      fastify.zodValidate({ body: MultiAgentBroadcastPreviewSchema })
    ],
    handler: handlers.previewMultiAgentBroadcast,
  });

  // Create multi-agent broadcast
  fastify.post('/broadcast/multi-agent', {
    preHandler: [
      fastify.authenticate, 
      fastify.zodValidate({ body: MultiAgentBroadcastSchema })
    ],
    handler: handlers.createMultiAgentBroadcast,
  });
};

export default fp(multiAgentBroadcastRoutes);