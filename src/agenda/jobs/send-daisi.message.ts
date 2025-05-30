import { Agenda, Job } from "@hokify/agenda";
import { FastifyInstance } from "fastify";
import { DaisiMessagePayload } from "../../types/daisi.types";
// import { TaskStatus } from "../../models/task";

export const defineSendDaisiMessageJob = (
  agenda: Agenda,
  fastify: FastifyInstance
) => {
  agenda.define("send-daisi-message", async (job: Job<DaisiMessagePayload & { taskId?: string }>) => {
    const payload = job.attrs.data;

    if (!payload) {
      job.fail("Missing payload");
      return;
    }

    const { agentId, taskId } = payload;
    const subject = `v1.agents.${agentId}`;

    try {
      if (taskId) {
        await fastify.taskService.update(taskId, {
          status: "PROCESSING",
        });
      };

      const result = await fastify.requestAgentEvent("SEND_MSG", subject, payload);
      (job.attrs as any).result = result;

      if (result?.success) {
          if (taskId) {
            await fastify.taskService.update(taskId, {
              status: "COMPLETED",
              finishedAt: new Date().toISOString(),
            });
          }
      } else {
        if (taskId) {
          await fastify.taskService.update(taskId, {
            status: "ERROR",
            errorReason: result?.error || "Unknown send failure",
            finishedAt: new Date().toISOString(),
          });
        }
        job.fail(result?.error || "Unknown send failure");
      }
    } catch (err) {
      console.error("[Agenda] Failed to send daisi message", err);

      if (taskId) {
        await fastify.taskService.update(taskId, {
          status: "ERROR",
          errorReason: (err as Error)?.message || "Unhandled failure",
          finishedAt: new Date().toISOString(),
        });
      };

      job.fail(err as Error);
    }
  });
};
