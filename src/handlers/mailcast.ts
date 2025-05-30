import { FastifyReply, FastifyRequest } from "fastify";
import { MailcastMessagePayload } from "../types/mailcast";
import { validateMessageType } from "../utils";
import { createTaskPayload } from "../utils/task";

export async function handleMailcastSendMessage(
  request: FastifyRequest<{ Body: MailcastMessagePayload }>,
  reply: FastifyReply
) {
  const payload = request.body;
  const { type, message, agentId, scheduleAt, companyId } = payload;

  // Validate company
  if (payload.companyId !== request.user?.company) { 
    return reply.status(403).send({ success: false, error: "Unauthorized company" });
  };

  const subject = `v1.mailcast.${agentId}`;
  const validationError = validateMessageType(type, message);

  if (validationError) {
    return reply.status(400).send({ success: false, error: validationError });
  }

  const jobName = "send-mailcast-message";
  const taskPayload = createTaskPayload("MAILCAST", "send", companyId, payload, jobName);
  const taskId = await request.server.taskService.create(taskPayload);

  const isScheduled = !!scheduleAt;

  if (isScheduled) {
    try {
      const job = await request.server.agenda.schedule(scheduleAt, jobName, {
        ...payload,
        companyId,
        taskId,
      });

      await request.server.taskService.update(taskId, {
        agendaJobId: job.attrs._id.toString(),
      });

      request.server.log.info("[Mailcast] Scheduled via Agenda for %s", scheduleAt);

      return reply.send({
        success: true,
        data: {
          status: "scheduled",
          taskId,
          scheduleAt,
        },
      });
    } catch (err) {
      request.log.error(err, "[Mailcast] Failed to schedule with Agenda");
      await request.server.taskService.update(taskId, "ERROR");

      return reply.status(500).send({
        success: false,
        error: "Failed to schedule message",
        taskId,
      });
    }
  }

  try {
    await request.server.taskService.update(taskId, "PROCESSING");

    await request.server.publishEvent(subject, {
      ...payload,
      taskId,
    });

    request.server.log.info("[Mailcast] Published to JetStream. Subject: %s", subject);

    return reply.send({
      success: true,
      data: {
        status: "sent",
        taskId,
      },
    });
  } catch (err) {
    request.log.error(err, "[Mailcast] Failed to publish to JetStream");

    await request.server.taskService.update(taskId, "ERROR");

    return reply.status(500).send({
      success: false,
      error: "Failed to send message via NATS",
      taskId,
    });
  }
}