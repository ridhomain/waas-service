// src/plugins/auth.ts
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifyToken } from '../utils/token';

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { authorization } = request.headers;

    if (!authorization) {
      return reply.status(401).send({ 
        success: false,
        error: { message: 'Missing authorization header' },
        timestamp: new Date().toISOString()
      });
    }

    const token = authorization.replace('Bearer ', '').trim();

    if (!token) {
      return reply.status(401).send({ 
        success: false,
        error: { message: 'Invalid authorization format' },
        timestamp: new Date().toISOString()
      });
    }

    const SECRET_AUTH = fastify.config.SECRET_KEY;
    const KEY = Buffer.from(SECRET_AUTH, 'hex');

    const { ok, company } = verifyToken(token, KEY);

    if (!ok || !company) {
      return reply.status(401).send({ 
        success: false,
        error: { message: 'Invalid token' },
        timestamp: new Date().toISOString()
      });
    }

    request.user = { company, token };
  });
};

export default fp(authPlugin, {
  name: 'auth',
  dependencies: ['config'],
});