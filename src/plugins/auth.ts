import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifyToken } from '../utils/token';

const tokenAuthBearerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { authorization } = request.headers;

    if (!authorization) {
      reply.status(401).send({ error: 'Missing authorization header' });
      return;
    }

    const token = authorization.replace('Bearer ', '').trim();

    const SECRET_AUTH = fastify.config.SECRET_KEY;
    const KEY = Buffer.from(SECRET_AUTH, 'hex');

    const { ok, company } = verifyToken(token, KEY);

    if (!ok) {
      reply.status(401).send({ error: 'Invalid token' });
      return;
    }

    request.user = { company, token };
  });
};

export default fp(tokenAuthBearerPlugin);
