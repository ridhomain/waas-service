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
};
