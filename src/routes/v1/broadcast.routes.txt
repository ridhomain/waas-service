import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

import {
  scheduleBroadcastByTags,
  scheduleBroadcastByPhones,
  scheduleBroadcastMultiSender,
  previewScheduleBroadcastByTags,
  // previewScheduleBroadcastByMultiSender,
  cancelBroadcast,
} from '../../handlers/broadcast';

import {
  scheduleBroadcastByTagsSchema,
  scheduleBroadcastByPhonesSchema,
  scheduleBroadcastMultiSenderSchema,
  previewScheduleBroadcastByTagsSchema,
  // previewScheduleBroadcastMultiSenderSchema,
  cancelBroadcastSchema,
} from '../../schemas/broadcast-schema';

const broadcastRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/broadcast/by-tags',
    { schema: scheduleBroadcastByTagsSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const company = request.user?.company;
      const payload = request.body;

      if (!company) {
        return reply.status(401).send({ error: 'Unauthorized user' });
      }

      const { success, data, error } = await scheduleBroadcastByTags(fastify, company, payload);

      if (success) {
        return reply.status(201).send({ success, message: 'Broadcast has been scheduled', data });
      } else {
        return reply.status(500).send({ success, error });
      }
    }
  );

  fastify.post(
    '/broadcast/preview-by-tags',
    { schema: previewScheduleBroadcastByTagsSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const company = request.user?.company;
      const payload = request.body;

      if (!company) {
        return reply.status(401).send({ error: 'Unauthorized user' });
      }

      const { success, data, error } = await previewScheduleBroadcastByTags(
        fastify,
        company,
        payload
      );

      if (success) {
        return reply
          .status(201)
          .send({ success, message: 'Preview broadcast by tags succeed', data });
      } else {
        return reply.status(500).send({ success, error });
      }
    }
  );

  fastify.post(
    '/broadcast/by-phones',
    { schema: scheduleBroadcastByPhonesSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const company = request.user?.company;

      if (!company) {
        return reply.status(401).send({ error: 'Unauthorized user' });
      }

      const payload = request.body;

      const { success, data, error } = await scheduleBroadcastByPhones(fastify, company, payload);

      if (success) {
        return reply.status(201).send({ success, message: 'Broadcast has been scheduled', data });
      } else {
        return reply.status(500).send({ success, error });
      }
    }
  );

  fastify.post(
    '/broadcast/multi-sender',
    { schema: scheduleBroadcastMultiSenderSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const company = request.user?.company;
      const payload = request.body;

      if (!company) {
        return reply.status(401).send({ error: 'Unauthorized user' });
      }

      const { success, data, error } = await scheduleBroadcastMultiSender(
        fastify,
        company,
        payload
      );

      if (success) {
        return reply.status(201).send({ success, message: 'Broadcast has been scheduled', data });
      } else {
        return reply.status(500).send({ success, error });
      }
    }
  );

  // fastify.post('/broadcast/preview-multi-sender', { schema: previewScheduleBroadcastMultiSenderSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
  //   const company = request.user?.company;
  //   const payload = request.body;

  //   if (!company) {
  //     return reply.status(401).send({ error: 'Unauthorized user' });
  //   };

  //   const { success, data, error } = await previewScheduleBroadcastByMultiSender(fastify, company, payload);

  //   if (success) {
  //     return reply.status(201).send({ success, message: 'Preview broadcast multi sender succeed', data });
  //   } else {
  //     return reply.status(500).send({ success, error });
  //   }
  // });

  fastify.delete(
    '/broadcast/cancel/:sender/:batchId',
    { schema: cancelBroadcastSchema },
    async (
      request: FastifyRequest<{
        Params: { sender: string; batchId: string };
      }>,
      reply: FastifyReply
    ) => {
      const company = request.user?.company;
      const { sender, batchId } = request.params;

      if (!company) {
        return reply.status(401).send({ error: 'Unauthorized user' });
      }

      const { success, data, error } = await cancelBroadcast(fastify, company, { sender, batchId });

      if (success) {
        return reply.status(201).send({ success, message: 'Cancel broadcast succeed', data });
      } else {
        return reply.status(500).send({ success, error });
      }
    }
  );
};

export default fp(broadcastRoutes);
