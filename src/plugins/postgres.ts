import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import postgres from '@fastify/postgres';

const postgresPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(postgres, {
    connectionString: fastify.config.POSTGRES_DSN,
  });

  // Test connection
  try {
    const client = await fastify.pg.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    
    fastify.log.info('[PostgreSQL] Connected successfully');
  } catch (err) {
    fastify.log.error({ err }, '[PostgreSQL] Connection failed');
    throw err;
  }
};

export default fp(postgresPlugin, {
  name: 'postgres',
  dependencies: ['env'],
});
