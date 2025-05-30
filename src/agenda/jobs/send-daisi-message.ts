// src/agenda/jobs/send-daisi.message.ts
import { Agenda, Job } from "@hokify/agenda";
import { FastifyInstance } from "fastify";
import { DaisiMessagePayload } from "../../types/daisi.types";

export const defineSendDaisiMessageJob = (
  agenda: Agenda,
  fastify: FastifyInstance
) => {
  agenda.define("send-daisi-message", async (job: Job<DaisiMessagePayload & { taskId?: string }>) => {
    const payload = job.attrs.data;

    if (!payload) {
      throw new Error("Missing payload");
    }

    const { agentId, taskId } = payload;
    const subject = `v1.agents.${agentId}`;

    try {
      // Update task status to processing if taskId exists
      if (taskId) {
        await fastify.taskRepository.update(taskId, {
          status: "PROCESSING",
        });
      };

      // Send message via request-reply pattern
      const result = await fastify.requestAgentEvent("SEND_MSG", subject, payload);
      
      // Store result in job attributes for potential debugging
      (job.attrs as any).result = result;

      if (result?.success) {
        if (taskId) {
          await fastify.taskRepository.update(taskId, {
            status: "COMPLETED",
            finishedAt: new Date(),
          });
        }
      } else {
        const errorMessage = result?.error || "Unknown send failure";
        
        if (taskId) {
          await fastify.taskRepository.update(taskId, {
            status: "ERROR",
            errorReason: errorMessage,
            finishedAt: new Date(),
          });
        }
        
        throw new Error(errorMessage);
      }
    } catch (err) {
      fastify.log.error({ err, agentId, taskId }, "[Agenda] Failed to send daisi message");

      if (taskId) {
        await fastify.taskRepository.update(taskId, {
          status: "ERROR",
          errorReason: err instanceof Error ? err.message : "Unhandled failure",
          finishedAt: new Date(),
        });
      }

      throw err; // Re-throw to mark job as failed
    }
  });
};
