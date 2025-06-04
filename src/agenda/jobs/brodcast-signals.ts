// src/agenda/jobs/broadcast-signals.ts
import { Agenda, Job } from '@hokify/agenda';
import { FastifyInstance } from 'fastify';
import { transitionBroadcastStatus } from '../../utils/broadcast.utils';

interface BroadcastSignalData {
  batchId: string;
  companyId: string;
  agentId: string;
  total?: number;
  taskAgent?: 'DAISI' | 'META';
}

export const defineBroadcastSignalJobs = (agenda: Agenda, fastify: FastifyInstance) => {
  // Signal to start broadcast
  agenda.define('signal-broadcast-start', async (job: Job<BroadcastSignalData>) => {
    const data = job.attrs.data;

    if (!data) {
      throw new Error('Missing job data');
    }

    const { batchId, agentId, companyId } = data;

    fastify.log.info({ batchId, agentId }, '[Broadcast] Sending START signal');

    try {
      // Transition from SCHEDULED/STARTING to PROCESSING
      const kv = await fastify.js.views.kv(`broadcast_state`);
      const transitionResult = await transitionBroadcastStatus(kv, agentId, batchId, 'PROCESSING');

      if (!transitionResult.success) {
        throw new Error(`Failed to transition status: ${transitionResult.error}`);
      }

      // Send start signal to agent
      await fastify.publishEvent(`v1.agents.${agentId}`, {
        action: 'START_BROADCAST',
        batchId,
        companyId,
      });

      // Update task statuses to PROCESSING for this batch
      const tasks = await fastify.taskRepository.findByBatch(batchId);
      let updatedCount = 0;

      for (const task of tasks) {
        if (task.status === 'PENDING') {
          await fastify.taskRepository.update(task._id!.toString(), {
            status: 'PROCESSING',
          });
          updatedCount++;
        }
      }

      fastify.log.info(
        { batchId, agentId, tasksUpdated: updatedCount, totalTasks: tasks.length },
        '[Broadcast] START signal sent successfully'
      );
    } catch (err) {
      // Transition to FAILED status on error
      try {
        const kv = await fastify.js.views.kv(`broadcast_state`);
        await transitionBroadcastStatus(kv, agentId, batchId, 'FAILED', {
          lastError: err instanceof Error ? err.message : 'Unknown error',
        });
      } catch (transitionErr) {
        fastify.log.error(
          { err: transitionErr, batchId, agentId },
          '[Broadcast] Failed to transition to FAILED status'
        );
      }

      fastify.log.error({ err, batchId, agentId }, '[Broadcast] Failed to send START signal');

      throw err;
    }
  });
};
