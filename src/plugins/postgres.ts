// src/plugins/postgres.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Pool } from 'pg';

declare module 'fastify' {
  interface FastifyInstance {
    pg: {
      pool: Pool;
    };
  }
}

const postgresPlugin: FastifyPluginAsync = async (fastify) => {
  const pool = new Pool({
    connectionString: fastify.config.POSTGRES_DSN,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    allowExitOnIdle: true,
  });

  // Test connection
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW(), current_database(), current_schema()');
    client.release();
    
    fastify.log.info({
      database: result.rows[0].current_database,
      schema: result.rows[0].current_schema,
      time: result.rows[0].now
    }, '[PostgreSQL] Connected successfully');
  } catch (err) {
    fastify.log.error({ err }, '[PostgreSQL] Connection failed');
    throw err;
  }

  // Handle errors
  pool.on('error', (err) => {
    fastify.log.error({ err }, '[PostgreSQL] Unexpected error on idle client');
  });

  // Log pool stats periodically in development
  if (fastify.config.NODE_ENV === 'development') {
    const logPoolStats = () => {
      const { totalCount, idleCount, waitingCount } = pool;
      fastify.log.debug({
        total: totalCount,
        idle: idleCount,
        waiting: waitingCount
      }, '[PostgreSQL] Pool stats');
    };
    
    const statsInterval = setInterval(logPoolStats, 30000); // Every 30s
    
    fastify.addHook('onClose', () => {
      clearInterval(statsInterval);
    });
  }

  // Decorate fastify instance
  fastify.decorate('pg', { pool });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    fastify.log.info('[PostgreSQL] Closing connection pool...');
    await pool.end();
    fastify.log.info('[PostgreSQL] Connection pool closed');
  });
};

export default fp(postgresPlugin, {
  name: 'postgres',
  dependencies: ['env'],
});