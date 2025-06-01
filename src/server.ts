// src/server.ts
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';

// Plugins
import envPlugin from './config';
import natsPlugin from './plugins/nats';
import authPlugin from './plugins/auth';
import mongodbPlugin from './plugins/mongodb';
import postgresPlugin from './plugins/postgres';
import agendaPlugin from './plugins/agenda';
import zodValidationPlugin from './plugins/zod-validation';

// Root Route
import apiRoutes from './routes/index';

async function start() {
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: process.env.NODE_ENV === 'production' ? undefined : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register plugins and routes
  await fastify.register(envPlugin);        // 'env' 
  await fastify.register(mongodbPlugin);    // depends on 'env'
  await fastify.register(postgresPlugin);       // depends on 'env'
  await fastify.register(natsPlugin);       // depends on 'env'
  await fastify.register(agendaPlugin);     // depends on 'env', 'mongodb'
  await fastify.register(authPlugin);       // depends on 'env'
  await fastify.register(zodValidationPlugin); // no dependencies
  await fastify.register(fastifyCors);
  await fastify.register(fastifyHelmet);
  await fastify.register(apiRoutes);

  // Graceful shutdown handlers
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

  for (const signal of signals) {
    process.on(signal, async () => {
      fastify.log.info({ signal }, 'Shutting down gracefully...');
      try {
        await fastify.close();
        fastify.log.info('Cleanup done.');
        process.exit(0);
      } catch (err) {
        fastify.log.error(err, 'Error during shutdown');
        process.exit(1);
      }
    });
  }

  // Start the server
  try {
    await fastify.listen({
      port: Number(fastify.config.PORT || 80),
      host: '0.0.0.0',
    });
    fastify.log.info(`Server listening on port ${fastify.config.PORT || 80}`);
  } catch (err) {
    fastify.log.error(err, 'Startup failed');
    process.exit(1);
  }
}

start();