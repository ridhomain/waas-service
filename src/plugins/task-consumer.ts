// src/plugins/task-consumer.ts (clean version)
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { StringCodec, AckPolicy, DeliverPolicy, ReplayPolicy, JsMsg, ConsumerConfig } from 'nats';
import { TaskStatus } from '../models/task';

const sc = StringCodec();

interface TaskUpdateEvent {
  taskId: string;
  status: TaskStatus;
  errorReason?: string;
  metadata?: Record<string, any>;
  agentId: string;
  companyId: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    taskConsumer: {
      isRunning: () => boolean;
      getStats: () => ConsumerStats;
      pause: () => Promise<void>;
      resume: () => Promise<void>;
    };
  }
}

interface ConsumerStats {
  processed: number;
  failed: number;
  batchesProcessed: number;
  avgBatchSize: number;
  lastProcessedAt?: Date;
}

const taskConsumerPlugin: FastifyPluginAsync = async (fastify) => {
  const batchSize = 100;
  const batchTimeout = 1000;
  const updateBuffer: Map<string, TaskUpdateEvent> = new Map();
  let batchTimer: NodeJS.Timeout | undefined;
  let isRunning = false;
  let isPaused = false;

  // Stats tracking
  const stats: ConsumerStats = {
    processed: 0,
    failed: 0,
    batchesProcessed: 0,
    avgBatchSize: 0,
  };

  const verifyTaskUpdateStream = async () => {
    const streamName = 'task_updates_stream';

    try {
      const info = await fastify.jsm.streams.info(streamName);
      fastify.log.info('[TaskConsumer] Connected to task updates stream', {
        messages: info.state.messages,
        bytes: info.state.bytes,
        consumer_count: info.state.consumer_count,
      });
    } catch (err) {
      fastify.log.error({ err }, '[TaskConsumer] Task updates stream not found');
      throw new Error('task_updates_stream not found - check NATS plugin initialization');
    }
  };

  // Process batch of updates using updateMany
  const processBatch = async () => {
    if (updateBuffer.size === 0) return;

    // Clear timer
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = undefined;
    }

    // Get all updates and clear buffer
    const updates = Array.from(updateBuffer.values());
    updateBuffer.clear();

    const startTime = Date.now();

    try {
      // Prepare batch updates
      const batchUpdates = updates.map((update) => {
        const updateData: any = {
          status: update.status,
          updatedAt: new Date(),
        };

        if (update.status === 'COMPLETED' || update.status === 'ERROR') {
          updateData.finishedAt = new Date();
        }

        if (update.errorReason) {
          updateData.errorReason = update.errorReason;
        }

        if (update.metadata) {
          updateData.metadata = update.metadata;
        }

        return {
          taskId: update.taskId,
          data: updateData,
        };
      });

      const result = await fastify.taskRepository.updateMany(batchUpdates);

      // Update stats
      stats.processed += result.successful;
      stats.failed += result.failed;
      stats.batchesProcessed++;
      stats.avgBatchSize = Math.round(stats.processed / stats.batchesProcessed);
      stats.lastProcessedAt = new Date();

      const duration = Date.now() - startTime;

      fastify.log.info(
        {
          successful: result.successful,
          failed: result.failed,
          total: updates.length,
          duration,
          avgPerUpdate: Math.round(duration / updates.length),
        },
        '[TaskConsumer] Batch processed'
      );

      if (result.failed > 0) {
        fastify.log.error(
          {
            failedCount: result.failed,
            totalAttempted: updates.length,
          },
          '[TaskConsumer] Some task updates failed in batch'
        );
      }
    } catch (err) {
      fastify.log.error(
        { err, batchSize: updates.length },
        '[TaskConsumer] Batch processing error'
      );
      stats.failed += updates.length;
    }
  };

  // Process single message
  const processMessage = async (msg: JsMsg) => {
    const data = JSON.parse(sc.decode(msg.data)) as TaskUpdateEvent;

    // Add to buffer for batch processing
    updateBuffer.set(data.taskId, data);

    // Process batch if size threshold reached
    if (updateBuffer.size >= batchSize) {
      await processBatch();
    } else {
      // Set timer for time-based batching
      if (!batchTimer) {
        batchTimer = setTimeout(() => {
          processBatch().catch((err) => {
            fastify.log.error({ err }, '[TaskConsumer] Batch processing failed');
          });
        }, batchTimeout);
      }
    }
  };

  // Main consumer loop - using consume() for queue groups
  const consume = async () => {
    isRunning = true;
    const consumer = await fastify.js.consumers.get('task_updates_stream', 'task-update-processor');

    fastify.log.info('[TaskConsumer] Started consuming messages');

    // Use consume() instead of subscribe() for better queue group support
    const messages = await consumer.consume({
      max_messages: 100, // Process up to 100 messages per batch
      expires: 30000, // 30 second timeout
      idle_heartbeat: 5000, // Send heartbeat every 5 seconds when idle
    });

    // Process messages
    for await (const msg of messages) {
      if (!isRunning || isPaused) {
        msg.nak();
        break;
      }

      try {
        await processMessage(msg);
        msg.ack();
      } catch (err) {
        fastify.log.error(
          { err, subject: msg.subject },
          '[TaskConsumer] Failed to process message'
        );

        // Simple retry logic - max 3 attempts total (initial + 2 retries)
        if (msg.info.redeliveryCount < 2) {
          msg.nak(); // Retry
        } else {
          // After max retries, just log and acknowledge to prevent blocking
          fastify.log.error(
            {
              taskId: JSON.parse(sc.decode(msg.data)).taskId,
              redeliveryCount: msg.info.redeliveryCount,
              error: err,
            },
            '[TaskConsumer] Task update failed after max retries'
          );
          msg.ack(); // Acknowledge to move on
        }
      }
    }

    // If still running, continue consuming
    if (isRunning && !isPaused) {
      // Small delay before next consume cycle
      setTimeout(() => {
        consume().catch((err) => {
          fastify.log.error({ err }, '[TaskConsumer] Consumer loop error, restarting...');
          if (isRunning) {
            setTimeout(() => consume(), 5000); // Retry after 5 seconds
          }
        });
      }, 100);
    }
  };

  // Start consumer
  const start = async () => {
    // Verify stream exists (created by NATS plugin)
    await verifyTaskUpdateStream();

    // Create durable consumer
    const consumerName = 'task-update-consumer';
    const streamName = 'task_updates_stream';

    try {
      // Check if consumer exists
      await fastify.jsm.consumers.info(streamName, consumerName);
      fastify.log.info(`[TaskConsumer] Consumer ${consumerName} already exists`);
    } catch (err: any) {
      if (err.message.includes('consumer not found')) {
        // Create consumer with queue group for load balancing across replicas
        const consumerConfig: ConsumerConfig = {
          durable_name: consumerName,
          ack_policy: AckPolicy.Explicit,
          deliver_policy: DeliverPolicy.All,
          replay_policy: ReplayPolicy.Instant,
          max_deliver: 3, // Max 3 attempts (initial + 2 retries)
          ack_wait: 30_000_000_000, // 30 seconds
          max_ack_pending: 1000,
          filter_subjects: ['v1.tasks.updates.*'],
          // Queue group ensures messages are distributed across replicas
          deliver_group: 'whatsapp-service-consumers',
        };

        await fastify.jsm.consumers.add(streamName, consumerConfig);
        fastify.log.info(`[TaskConsumer] Created consumer ${consumerName}`);
      }
    }

    // Start consuming in background
    consume().catch((err) => {
      fastify.log.error({ err }, '[TaskConsumer] Consumer loop failed');
      isRunning = false;
    });
  };

  // Start the consumer
  await start();

  // Decorate fastify with consumer controls
  fastify.decorate('taskConsumer', {
    isRunning: () => isRunning && !isPaused,
    getStats: () => ({ ...stats }),
    pause: async () => {
      isPaused = true;
      fastify.log.info('[TaskConsumer] Paused');
    },
    resume: async () => {
      isPaused = false;
      if (!isRunning) {
        consume().catch((err) => {
          fastify.log.error({ err }, '[TaskConsumer] Failed to resume');
        });
      }
      fastify.log.info('[TaskConsumer] Resumed');
    },
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    fastify.log.info('[TaskConsumer] Shutting down...');
    isRunning = false;

    // Process remaining buffer
    if (updateBuffer.size > 0) {
      await processBatch();
    }

    if (batchTimer) {
      clearTimeout(batchTimer);
    }

    fastify.log.info('[TaskConsumer] Shutdown complete');
  });
};

export default fp(taskConsumerPlugin, {
  name: 'task-consumer',
  dependencies: ['nats', 'mongodb'],
});
