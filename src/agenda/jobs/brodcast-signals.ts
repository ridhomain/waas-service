// src/agenda/jobs/broadcast-signals.ts
import { Agenda, Job } from "@hokify/agenda";
import { FastifyInstance } from "fastify";
import { StringCodec } from 'nats';

interface BroadcastSignalData {
  batchId: string;
  companyId: string;
  agentId: string;
  total?: number;
}

export const defineBroadcastSignalJobs = (
  agenda: Agenda,
  fastify: FastifyInstance
) => {
  const sc = StringCodec();

  // Signal to start broadcast
  agenda.define("signal-broadcast-start", async (job: Job<BroadcastSignalData>) => {
    const data = job.attrs.data;

    if (!data) {
      throw new Error("Missing job data");
    }

    const { batchId, agentId, companyId } = data;

    fastify.log.info(
      { batchId, agentId },
      "[Broadcast] Sending START signal"
    );

    try {
      // Update KV state to PROCESSING
      const kv = await fastify.js.views.kv(`broadcast_state`);
      const stateKey = `${agentId}_${batchId}`;
      const currentState = await kv.get(stateKey);

      if (currentState?.value) {
        const state = JSON.parse(sc.decode(currentState.value));
        state.status = 'PROCESSING';
        state.startedAt = new Date();
        await kv.put(stateKey, sc.encode(JSON.stringify(state)), { 
          ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
      }

      // Send start signal to agent
      await fastify.publishEvent(`v1.broadcast.control.${agentId}`, {
        action: 'START_BROADCAST',
        batchId,
        companyId,
      });

      // Update task statuses to PROCESSING for this batch
      const tasks = await fastify.taskRepository.findByBatch(batchId);
      for (const task of tasks) {
        if (task.status === 'PENDING') {
          await fastify.taskRepository.update(task._id!.toString(), {
            status: 'PROCESSING',
          });
        }
      }

      fastify.log.info(
        { batchId, agentId, tasksUpdated: tasks.length },
        "[Broadcast] START signal sent successfully"
      );

    } catch (err) {
      fastify.log.error(
        { err, batchId, agentId },
        "[Broadcast] Failed to send START signal"
      );
      throw err;
    }
  });

  // Periodic job to check broadcast completion
  agenda.define("check-broadcast-completion", async (job: Job) => {
    try {
      // Find all PROCESSING broadcasts
      const processingTasks = await fastify.taskRepository.findByCompany('', {
        taskType: 'broadcast',
        status: 'PROCESSING',
      }, { limit: 1000 });

      // Group by batch
      const batches = new Map<string, any[]>();
      for (const task of processingTasks) {
        if (!task.batchId) continue;
        if (!batches.has(task.batchId)) {
          batches.set(task.batchId, []);
        }
        batches.get(task.batchId)!.push(task);
      }

      // Check each batch
      for (const [batchId, tasks] of batches) {
        const allTasks = await fastify.taskRepository.findByBatch(batchId);
        const stats = {
          total: allTasks.length,
          completed: allTasks.filter(t => t.status === 'COMPLETED').length,
          failed: allTasks.filter(t => t.status === 'ERROR').length,
          processing: allTasks.filter(t => t.status === 'PROCESSING').length,
          pending: allTasks.filter(t => t.status === 'PENDING').length,
        };

        // If all tasks are done (completed or failed)
        if (stats.processing === 0 && stats.pending === 0) {
          const agentId = allTasks[0].agentId;
          
          // Update KV state
          const kv = await fastify.js.views.kv(`broadcast_state`);
          const stateKey = `${agentId}_${batchId}`;
          const currentState = await kv.get(stateKey);

          if (currentState?.value) {
            const state = JSON.parse(sc.decode(currentState.value));
            state.status = 'COMPLETED';
            state.completedAt = new Date();
            state.stats = stats;
            await kv.put(stateKey, sc.encode(JSON.stringify(state)), { 
              ttl: 7 * 24 * 60 * 60 * 1000 
            });
          }

          fastify.log.info(
            { batchId, stats },
            "[Broadcast] Broadcast marked as completed"
          );
        }
      }
    } catch (err) {
      fastify.log.error(
        { err },
        "[Broadcast] Error checking broadcast completion"
      );
    }
  });

  // Schedule periodic completion check
  agenda.every('1 minute', 'check-broadcast-completion');
};