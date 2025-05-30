import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { sendMetaMessageSchema } from '../../schemas/meta-schema';
import { handleMetaSendMessage } from '../../handlers/meta';

const metaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/meta/send-message",
    {
      schema: sendMetaMessageSchema
    },
    handleMetaSendMessage
  );
};

export default fp(metaRoutes);
