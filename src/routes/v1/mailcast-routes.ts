import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { handleMailcastSendMessage } from '../../handlers/mailcast';
import { sendMailcastMessageSchema } from '../../schemas/mailcast-schema';

const mailcastRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/mailcast/send-message",
    { schema: sendMailcastMessageSchema },
    handleMailcastSendMessage
  );
};

export default fp(mailcastRoutes);
