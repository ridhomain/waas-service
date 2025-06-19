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
      fastify.log.info(`[TaskConsumer] Connected to task updates stream`, {
        name: streamName,
        messages: info.state.messages,
        bytes: info.state.bytes,
        consumer_count: info.state.consumer_count,
      });
    } catch (err: any) {
      fastify.log.error({ err }, `[TaskConsumer] Task updates stream not found`);
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
    try {
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
    } catch (err) {
      fastify.log.error({ err, subject: msg.subject }, '[TaskConsumer] Failed to parse message');
      throw err;
    }
  };

  // Create or get consumer
  const ensureConsumer = async () => {
    const consumerName = 'task-update-consumer';
    const streamName = 'task_updates_stream';

    try {
      // Check if consumer exists
      const consumerInfo = await fastify.jsm.consumers.info(streamName, consumerName);
      fastify.log.info(`[TaskConsumer] Consumer ${consumerName} already exists`, {
        pending: consumerInfo.num_pending,
        delivered: consumerInfo.delivered.stream_seq,
      });
      return consumerName;
    } catch (err: any) {
      if (err.message.includes('consumer not found')) {
        // Create consumer with queue group for load balancing across replicas
        const consumerConfig: ConsumerConfig = {
          durable_name: consumerName,
          ack_policy: AckPolicy.Explicit,
          deliver_policy: DeliverPolicy.All,
          replay_policy: ReplayPolicy.Instant,
          max_deliver: 3, // Max 3 attempts (initial + 2 retries)
          ack_wait: 30_000_000_000, // 30 seconds in nanoseconds
          max_ack_pending: 1000,
          filter_subjects: ['v1.tasks.updates.*'],
          // Queue group ensures messages are distributed across replicas
          deliver_group: 'whatsapp-service-consumers',
        };

        await fastify.jsm.consumers.add(streamName, consumerConfig);
        fastify.log.info(`[TaskConsumer] Created consumer ${consumerName}`);
        return consumerName;
      } else {
        throw err;
      }
    }
  };

  // Main consumer loop using pull subscription
  const consume = async () => {
    try {
      isRunning = true;

      // Ensure consumer exists
      const consumerName = await ensureConsumer();
      const consumer = await fastify.js.consumers.get('task_updates_stream', consumerName);

      fastify.log.info('[TaskConsumer] Started consuming messages');

      while (isRunning && !isPaused) {
        try {
          // Fetch messages in batches
          const messages = await consumer.fetch({
            max_messages: 50,
            expires: 10000,
          });

          let messageCount = 0;

          // Process messages
          for await (const msg of messages) {
            if (!isRunning || isPaused) {
              msg.nak();
              break;
            }

            try {
              await processMessage(msg);
              msg.ack();
              messageCount++;
            } catch (err) {
              fastify.log.error(
                { err, subject: msg.subject },
                '[TaskConsumer] Failed to process message'
              );

              // Simple retry logic - max 3 attempts total (initial + 2 retries)
              if (msg.info.deliveryCount < 2) {
                msg.nak(); // Retry
              } else {
                // After max retries, just log and acknowledge to prevent blocking
                fastify.log.error(
                  {
                    redeliveryCount: msg.info.deliveryCount,
                    error: err,
                  },
                  '[TaskConsumer] Task update failed after max retries'
                );
                msg.ack(); // Acknowledge to move on
              }
            }
          }

          if (messageCount > 0) {
            fastify.log.debug(`[TaskConsumer] Processed ${messageCount} messages`);
          }

          // Small delay before next fetch if no messages
          if (messageCount === 0) {
            await sleep(1000);
          }
        } catch (err: any) {
          if (err.message.includes('no messages')) {
            // No messages available, continue with delay
            await sleep(5000);
            continue;
          } else {
            fastify.log.error({ err }, '[TaskConsumer] Error fetching messages');
            await sleep(5000); // Wait before retry
          }
        }
      }
    } catch (err) {
      fastify.log.error({ err }, '[TaskConsumer] Consumer loop error');
      isRunning = false;

      // Restart after delay if not shutting down
      if (!isPaused) {
        setTimeout(() => {
          if (!isRunning) {
            consume().catch((restartErr) => {
              fastify.log.error({ err: restartErr }, '[TaskConsumer] Failed to restart consumer');
            });
          }
        }, 10000); // Wait 10 seconds before restart
      }
    }
  };

  // Start consumer
  const start = async () => {
    try {
      // Verify stream exists (created by NATS plugin)
      await verifyTaskUpdateStream();

      // Start consuming in background
      consume().catch((err) => {
        fastify.log.error({ err }, '[TaskConsumer] Initial consumer start failed');
      });
    } catch (err) {
      fastify.log.error({ err }, '[TaskConsumer] Failed to start consumer');
      throw err;
    }
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

// Helper function
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default fp(taskConsumerPlugin, {
  name: 'task-consumer',
  dependencies: ['nats', 'mongodb'],
});
