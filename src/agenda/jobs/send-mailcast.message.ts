import { Agenda, Job } from "@hokify/agenda";
import { FastifyInstance } from "fastify";
import { MailcastMessagePayload } from "../../types/mailcast";

export const defineSendMailcastMessageJob = (
  agenda: Agenda,
  fastify: FastifyInstance
) => {
  agenda.define("send-mailcast-message", async (job: Job<MailcastMessagePayload & { taskId?: string }>) => {
    const payload = job.attrs.data;

    if (!payload) {
      job.fail("Missing payload");
      return;
    }

    const { agentId, taskId } = payload;
    const subject = `v1.mailcast.${agentId}`;

    try {
      if (taskId) {
        await fastify.taskService.update(taskId, {
          status: "PROCESSING",
        });
      }

      await fastify.publishEvent(subject, payload);
      (job.attrs as any).result = { status: "published" };

    } catch (err) {
      console.error("[Agenda] Failed to publish mailcast message", err);

      if (taskId) {
        await fastify.taskService.update(taskId, {
          status: "ERROR",
          errorReason: (err as Error)?.message || "Unhandled failure",
          finishedAt: new Date().toISOString(),
        });
      }

      job.fail(err as Error);
    }
  });
};
