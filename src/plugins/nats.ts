import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { connect, StringCodec, JetStreamClient, JetStreamManager } from 'nats';

const natsPlugin: FastifyPluginAsync = async (fastify) => {
  const nc = await connect({
    servers: fastify.config.NATS_URL,
    user: "admin",
    pass: "admin",
    name: `daisi-whatsapp-service-${process.pid}`,
    reconnect: true,
    maxReconnectAttempts: 5,
    reconnectTimeWait: 2000,
    timeout: 5000,
  });

  fastify.log.info(`[NATS] Connected to %o`, nc.getServer());

  // Status logging
  const status = nc.status();
  (async () => {
    try {
      for await (const s of status) {
        switch (s.type) {
          case 'disconnect':
            fastify.log.warn('NATS disconnected: %s', s.data);
            break;
          case 'reconnect':
            fastify.log.info('NATS reconnected: %s', s.data);
            break;
          case 'error':
            fastify.log.error('NATS error: %s', s.data);
            break;
          case 'update':
            fastify.log.info('NATS server update: %o', s.data);
            break;
          default:
            fastify.log.info('NATS event [%s]: %o', s.type, s.data);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        fastify.log.error('NATS closed with error: %s', err.message);
      } else if (err) {
        fastify.log.error('NATS closed with unknown error: %o', err);
      } else {
        fastify.log.warn('NATS connection closed normally.');
      }
    }
  })();

  const js: JetStreamClient = nc.jetstream();
  const jsm: JetStreamManager = await nc.jetstreamManager();
  const sc = StringCodec();

  // utils functions
  const requestAgentEvent = async (action: string, subject: string, payload: any, timeout = 3000) => {
    const data = {
      action,
      payload
    };
  
    const encoded = sc.encode(JSON.stringify(data));

    try {
      const msg = await nc.request(subject, encoded, { timeout });
      const decoded = sc.decode(msg.data);
      fastify.log.info(`[NATS Request] Response from ${subject}: ${decoded}`);
      const result = JSON.parse(decoded);
      return result;
    } catch (err: any) {
      throw new Error(`[NATS Request] Failed for ${subject}: ${err.message || err}`);
    }
  };

  const publishEvent = async (subject: string, data: any) => {
    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      const encoded = sc.encode(payload);

      const ack = await js.publish(subject, encoded);
      fastify.log.info(`[NATS] Published to ${subject}. ack: %o`, ack);
    } catch (err) {
      fastify.log.error(`[NATS] Error publishing to ${subject}. error: %o`, err);
    }
  };
    
  fastify.decorate('nats', nc);
  fastify.decorate('js', js);
  fastify.decorate('jsm', jsm);
  fastify.decorate('requestAgentEvent', requestAgentEvent);
  fastify.decorate('publishEvent', publishEvent);

  fastify.addHook('onClose', async () => {
    await nc.close();
    fastify.log.info('NATS JetStream connection closed cleanly.');
  });
};

export default fp(natsPlugin);
