import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { sendCommand, testNotification } from '../../handlers/worker.js';
import { sendCommandSchema } from '../../schemas/worker-schema.js';
import { SendCommandPayload, TestNotificationPayload } from '../../types/command.js';

const workerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/worker',
    { schema: sendCommandSchema },
    async (request: FastifyRequest<{ Body: SendCommandPayload }>, reply: FastifyReply) => {
      const company = request.user?.company;

      if (!company) {
        return reply.status(401).send({ error: 'Unauthorized user' });
      }

      const payload = request.body;

      const { success, data, error } = await sendCommand(fastify, company, payload);

      if (success) {
        return reply.status(201).send({ success, message: 'Command has been sent', data });
      } else {
        return reply.status(500).send({ success, error });
      }
    }
  );

  // fastify.post(
  //   '/test-notification',
  //   async (
  //     request: FastifyRequest<{ Body: TestNotificationPayload }>,
  //     reply: FastifyReply
  //   ) => {
  //     const company = request.user?.company;
  //     const payload = request.body;

  //     const { success, data, error } = await testNotification(fastify, company, payload);

  //     if (success) {
  //       return reply.status(201).send({ message: 'Notification test successfully sent', data });
  //     } else {
  //       return reply.status(500).send({ error });
  //     }
  //   }
  // );
};

export default fp(workerRoutes);
