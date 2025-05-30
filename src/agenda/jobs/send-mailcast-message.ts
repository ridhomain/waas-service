// src/agenda/jobs/send-mailcast-message.ts (updated)
import { Agenda, Job } from "@hokify/agenda";
import { FastifyInstance } from "fastify";
import { MailcastSendMessageInput } from "../../schemas/zod-schemas";

export const defineSendMailcastMessageJob = (
  agenda: Agenda,
  fastify: FastifyInstance
) => {
  agenda.define("send-mailcast-message", async (job: Job<MailcastSendMessageInput & { taskId?: string }>) => {
    const payload = job.attrs.data;

    if (!payload) {
      throw new Error("Missing payload");
    }

    const { agentId, taskId } = payload;
    const subject = `v1.mailcast.${agentId}`;

    try {
      if (taskId) {
        await fastify.taskRepository.update(taskId, {
          status: "PROCESSING",
        });
      }

      // Publish to NATS JetStream
      await fastify.publishEvent(subject, payload);
      
      // Store status in job attributes
      (job.attrs as any).result = { status: "published" };

      // Note: We don't update task to COMPLETED here
      // The WA Events Processor will handle that when it actually sends the message

      fastify.log.info({ subject, taskId, agentId }, "[Agenda] Mailcast message published to JetStream");

    } catch (err) {
      fastify.log.error({ err, agentId, taskId }, "[Agenda] Failed to publish mailcast message");

      if (taskId) {
        await fastify.taskRepository.update(taskId, {
          status: "ERROR",
          errorReason: err instanceof Error ? err.message : "Failed to publish to NATS",
          finishedAt: new Date(),
        });
      }

      throw err; // Re-throw to mark job as failed
    }
  });
};