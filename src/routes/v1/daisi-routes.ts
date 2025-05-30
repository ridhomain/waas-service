import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { handleDaisiSendMessage, handleDaisiSendMessageToGroup, handleLogout, handleMarkAsRead } from '../../handlers/daisi';
import { sendDaisiMessageSchema, markAsReadSchema, logoutSchema, sendDaisiMessageToGroupSchema } from '../../schemas/daisi-schema';

const daisiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/daisi/send-message",
    { schema: sendDaisiMessageSchema },
    handleDaisiSendMessage
  );

  fastify.post(
    "/daisi/send-message-to-group",
    { schema: sendDaisiMessageToGroupSchema },
    handleDaisiSendMessageToGroup
  );

  fastify.post(
    "/daisi/mark-as-read",
    { schema: markAsReadSchema },
    handleMarkAsRead
  );

  fastify.post(
    "/daisi/logout",
    { schema: logoutSchema },
    handleLogout
  );
};

export default fp(daisiRoutes);
