// src/plugins/postgres.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifyPostgres from '@fastify/postgres';

const postgresPlugin: FastifyPluginAsync = async (fastify) => {
  const connectionString = fastify.config.POSTGRES_DSN;

  // Parse the connection URL
  const url = new URL(connectionString);

  // Configuration for DigitalOcean managed PostgreSQL
  const config = {
    user: url.username,
    password: url.password,
    host: url.hostname,
    port: parseInt(url.port || '25060'),
    database: url.pathname.slice(1),
    ssl: {
      rejectUnauthorized: false,
    },
    // Connection pool settings
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  try {
    await fastify.register(fastifyPostgres, config);

    // Test connection
    const client = await fastify.pg.connect();
    const result = await client.query('SELECT NOW() as current_time, current_database() as db');

    fastify.log.info(
      {
        time: result.rows[0].current_time,
        database: result.rows[0].db,
        host: url.hostname,
      },
      '[PostgreSQL] Connected successfully'
    );

    // List available schemas for debugging
    // if (process.env.NODE_ENV === 'development') {
    //   const schemas = await client.query(`
    //     SELECT schema_name
    //     FROM information_schema.schemata
    //     WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    //     ORDER BY schema_name
    //   `);
    //   fastify.log.info('[PostgreSQL] Available schemas: %o', schemas.rows.map((r: any)=> r.schema_name));
    // }

    client.release();
  } catch (err) {
    fastify.log.error(
      {
        error: err,
        host: url.hostname,
      },
      '[PostgreSQL] Connection failed'
    );
    throw err;
  }
};

export default fp(postgresPlugin, {
  name: 'postgres',
  dependencies: ['env'],
});
