// src/plugins/nats.ts (clean version without DLQ)
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  connect,
  StringCodec,
  JetStreamClient,
  JetStreamManager,
  RetentionPolicy,
  StorageType,
  DiscardPolicy,
  KV,
} from 'nats';

function parseNatsUrl(natsUrl: string) {
  try {
    const url = new URL(natsUrl);

    return {
      servers: `${url.protocol}//${url.host}`,
      user: url.username || undefined,
      pass: url.password || undefined,
      host: url.hostname,
      port: url.port ? parseInt(url.port) : 4222,
    };
  } catch (error: any) {
    throw new Error(error);
  }
}

const natsPlugin: FastifyPluginAsync = async (fastify) => {
  const natsConfig = parseNatsUrl(fastify.config.NATS_URL);

  const nc = await connect({
    servers: fastify.config.NATS_URL,
    user: natsConfig.user,
    pass: natsConfig.pass,
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

  // Initialize NATS resources (streams and KV)
  await initializeNATSResources(js, jsm, fastify);

  // utils functions
  const requestAgentEvent = async (
    action: string,
    subject: string,
    payload: any,
    timeout = 10000
  ) => {
    const data = {
      action,
      payload,
    };

    const encoded = sc.encode(JSON.stringify(data));

    try {
      const msg = await nc.request(subject, encoded, { timeout });
      const decoded = sc.decode(msg.data);
      fastify.log.info(`[NATS Request] Response from ${subject}: ${decoded}`);
      const result = JSON.parse(decoded);
      return result;
    } catch (err: any) {
      return {
        success: false,
        error:
          err.message.includes('timeout') || err.message.includes('no responders')
            ? 'Agent is offline or not responding'
            : err.message,
      };
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

export default fp(natsPlugin, {
  name: 'nats',
  dependencies: ['env'],
});

async function initializeNATSResources(
  js: JetStreamClient,
  jsm: JetStreamManager,
  fastify: FastifyInstance
): Promise<void> {
  // Create outbound stream (to Agent APIs)
  await ensureAgentDurableStream(jsm, fastify);

  // Create inbound stream (task updates)
  await ensureTaskUpdatesStream(jsm, fastify);

  // Create KV store for broadcast state
  const kv = await ensureBroadcastStateKV(js, fastify);
  fastify.decorate('broadcastStateKV', kv);

  fastify.log.info('[NATS] All NATS resources initialized successfully');
}

// Main stream creation function
async function ensureAgentDurableStream(
  jsm: JetStreamManager,
  fastify: FastifyInstance
): Promise<void> {
  const streamName = 'agent_durable_stream';

  try {
    const streamInfo = await jsm.streams.info(streamName);
    fastify.log.info(`[NATS] Stream "${streamName}" already exists`, {
      messages: streamInfo.state.messages,
      bytes: streamInfo.state.bytes,
      consumer_count: streamInfo.state.consumer_count,
    });
  } catch (err: any) {
    if (err.message.includes('stream not found')) {
      await jsm.streams.add({
        name: streamName,
        subjects: ['v1.broadcasts.*', 'v1.mailcasts.*'],
        retention: RetentionPolicy.Limits,
        max_age: 3 * 24 * 60 * 60 * 1_000_000_000, // 3 days in nanoseconds
        max_bytes: 1024 * 1024 * 1024, // 1GB
        max_msgs: 1000000, // 1 million messages max
        storage: StorageType.File,
        discard: DiscardPolicy.Old,
        duplicate_window: 60 * 1_000_000_000, // 1 minute deduplication window
        description: 'Durable stream for agent broadcast and mailcast messages',
      });

      fastify.log.info(`[NATS] Stream "${streamName}" created successfully`, {
        subjects: ['v1.broadcasts.*', 'v1.mailcasts.*'],
        retention: '3 days',
        max_size: '1GB',
      });
    } else {
      throw err;
    }
  }
}

// Task updates stream creation function
async function ensureTaskUpdatesStream(
  jsm: JetStreamManager,
  fastify: FastifyInstance
): Promise<void> {
  const streamName = 'task_updates_stream';

  try {
    const streamInfo = await jsm.streams.info(streamName);
    fastify.log.info(`[NATS] Stream "${streamName}" already exists`, {
      messages: streamInfo.state.messages,
      bytes: streamInfo.state.bytes,
      consumer_count: streamInfo.state.consumer_count,
    });
  } catch (err: any) {
    if (err.message.includes('stream not found')) {
      await jsm.streams.add({
        name: streamName,
        subjects: [
          'v1.tasks.updates.*', // From Agent APIs
          'v1.tasks.mailcast.*', // From Mailcast Service
          // 'v1.tasks.external.*' // From external webhooks if needed
        ],
        retention: RetentionPolicy.Limits,
        max_age: 24 * 60 * 60 * 1_000_000_000, // 1 day in nanoseconds
        max_bytes: 512 * 1024 * 1024, // 512MB
        max_msgs: 500000, // 500k messages max
        storage: StorageType.File,
        discard: DiscardPolicy.Old,
        duplicate_window: 30 * 1_000_000_000, // 30 seconds deduplication
        description: 'Inbound task status updates from all sources',
      });

      fastify.log.info(`[NATS] Stream "${streamName}" created successfully`, {
        subjects: ['v1.tasks.updates.*', 'v1.tasks.mailcast.*', 'v1.tasks.external.*'],
        retention: '1 day',
        max_size: '512MB',
      });
    } else {
      throw err;
    }
  }
}

// KV store creation function
async function ensureBroadcastStateKV(js: JetStreamClient, fastify: FastifyInstance): Promise<KV> {
  const kvName = 'broadcast_state';

  try {
    const kv = await js.views.kv(kvName);
    const status = await kv.status();

    fastify.log.info('[NATS] Connected to existing broadcast_state KV', {
      bucket: status.bucket,
      values: status.values,
      history: status.history,
      ttl: status.ttl,
    });

    return kv;
  } catch (err: any) {
    if (err.message.includes('bucket not found')) {
      const kv = await js.views.kv(kvName, {
        history: 5,
        ttl: 7 * 24 * 60 * 60 * 1000, // 7 days TTL in milliseconds
        description: 'Broadcast state tracking for agent APIs',
      });

      fastify.log.info(`[NATS] Created broadcast_state KV store`, {
        name: kvName,
        ttl: '7 days',
        history: 5,
      });

      return kv;
    } else {
      throw err;
    }
  }
}
