// src/agenda/jobs/broadcast-signals.ts
import { Agenda, Job } from '@hokify/agenda';
import { FastifyInstance } from 'fastify';
import { transitionBroadcastStatus } from '../../utils/broadcast.utils';
// import { StringCodec } from 'nats';

// const sc = StringCodec();

interface BroadcastSignalData {
  batchId: string;
  companyId: string;
  agentId: string;
  total?: number;
  taskAgent?: 'DAISI' | 'META';
}

export const defineBroadcastSignalJobs = (agenda: Agenda, fastify: FastifyInstance) => {
  // Signal to start broadcast when scheduled time arrives
  agenda.define('signal-broadcast-start', async (job: Job<BroadcastSignalData>) => {
    const data = job.attrs.data;

    if (!data) {
      throw new Error('Missing job data');
    }

    const { batchId, agentId } = data;

    fastify.log.info({ batchId, agentId }, '[Broadcast] Starting scheduled broadcast');

    try {
      // Transition directly from SCHEDULED to PROCESSING
      const kv = await fastify.js.views.kv('broadcast_state');
      const transitionResult = await transitionBroadcastStatus(kv, agentId, batchId, 'PROCESSING');

      if (!transitionResult.success) {
        throw new Error(`Failed to start broadcast: ${transitionResult.error}`);
      }

      // Update task statuses to PROCESSING for this batch
      const tasks = await fastify.taskRepository.findByBatch(batchId);

      // for (const task of tasks) {
      //   if (task.status === 'PENDING') {
      //     await fastify.taskRepository.update(task._id!.toString(), {
      //       status: 'PROCESSING',
      //     });
      //     updatedCount++;
      //   }
      // }

      fastify.log.info(
        {
          batchId,
          agentId,
          // tasksUpdated: updatedCount,
          totalTasks: tasks.length,
        },
        '[Broadcast] Broadcast started successfully'
      );

      // Update job status
      job.attrs.lastRunAt = new Date();
      // job.attrs.nextRunAt = undefined;
      await job.save();
    } catch (err) {
      // Transition to FAILED status on error
      try {
        const kv = await fastify.js.views.kv('broadcast_state');
        await transitionBroadcastStatus(kv, agentId, batchId, 'FAILED', {
          lastError: err instanceof Error ? err.message : 'Unknown error',
        });
      } catch (transitionErr) {
        fastify.log.error(
          { err: transitionErr, batchId, agentId },
          '[Broadcast] Failed to transition to FAILED status'
        );
      }

      fastify.log.error({ err, batchId, agentId }, '[Broadcast] Failed to start broadcast');

      throw err;
    }
  });

  // Optional: Define cleanup job for old broadcast states
  // agenda.define('cleanup-broadcast-states', async (job: Job) => {
  //   fastify.log.info('[Broadcast] Running broadcast state cleanup');

  //   try {
  //     const kv = await fastify.js.views.kv('broadcast_state');
  //     const keys = await kv.keys();
  //     const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  //     let cleanedCount = 0;

  //     for await (const key of keys) {
  //       const entry = await kv.get(key);
  //       if (entry?.value) {
  //         const state = JSON.parse(sc.decode(entry.value));

  //         // Check if broadcast is terminal and older than 30 days
  //         if (['COMPLETED', 'CANCELLED', 'FAILED'].includes(state.status)) {
  //           const completedAt = state.completedAt || state.cancelledAt || state.lastUpdated;
  //           if (completedAt && new Date(completedAt) < thirtyDaysAgo) {
  //             await kv.delete(key);
  //             cleanedCount++;
  //           }
  //         }
  //       }
  //     }

  //     fastify.log.info(
  //       { cleanedCount },
  //       '[Broadcast] Cleaned up old broadcast states'
  //     );
  //   } catch (err) {
  //     fastify.log.error({ err }, '[Broadcast] Failed to cleanup broadcast states');
  //     throw err;
  //   }
  // });

  // Schedule cleanup to run daily at 2 AM
  // agenda.every('0 2 * * *', 'cleanup-broadcast-states');
};
