// handlers/daisi.ts
import { FastifyReply, FastifyRequest } from "fastify";
import { validateMessageType } from "../utils";
import { createTaskPayload } from "../utils/task";

export async function handleDaisiSendMessage(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const payload = request.body as {
    companyId: string;
    agentId: string;
    type: string;
    phoneNumber: string;
    message: any;
    scheduleAt?: string;
    options?: Record<string, any>;
    variables?: Record<string, any>;
    userId?: string;
    label?: string;
  };

  // Validate company
  if (payload.companyId !== request.user?.company) { 
    return reply.status(403).send({ success: false, error: "Unauthorized company" });
  };

  const { agentId, type, message, scheduleAt, companyId } = payload;
  const subject = `v1.agents.${agentId}`;
  const validationError = validateMessageType(type, message);
  if (validationError) {
    return reply.status(400).send({ success: false, error: validationError });
  }

  const jobName = "send-daisi-message";

  const taskPayload = createTaskPayload("DAISI", "send", companyId, payload, jobName);
  const taskId = await request.server.taskService.create(taskPayload);

  const isScheduled = !!scheduleAt;

  if (isScheduled) {
    const job = await request.server.agenda.schedule(scheduleAt!, jobName, {
      ...payload,
      companyId,
      taskId,
    });

    await request.server.taskService.update(taskId, {
      agendaJobId: job.attrs._id.toString(),
    });

    return reply.status(200).send({
      success: true,
      data: {
        status: "scheduled",
        taskId,
        scheduleAt,
      },
    });
  }

  // Send immediately
  try {
    const result = await request.server.requestAgentEvent("SEND_MSG", subject, {
      ...payload,
      taskId,
    });

    request.log.info("[Daisi] Sent message to agent", { subject, result });

    if (!result?.success) {
      await request.server.taskService.update(taskId, {
        status: "ERROR",
        errorReason: result?.error || "Unknown failure",
        finishedAt: new Date().toISOString(),
      });

      return reply.status(500).send({ success: false, error: result?.error || "Unknown failure", taskId });
    };

    await request.server.taskService.update(taskId, {
      status: "COMPLETED",
      finishedAt: new Date().toISOString(),
    });

    return reply.status(200).send({
      success: true,
      data: {
        status: "sent",
        taskId,
        result: result.data,
      },
    });
  } catch (err) {
    request.log.error(err, "[Daisi] AgentAPI communication failed");
    await request.server.taskService.update(taskId, "ERROR");
    return reply.status(500).send({ success: false, error: "Agent not responding or failed", taskId });
  }
}

export async function handleDaisiSendMessageToGroup(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const payload = request.body as {
    companyId: string;
    agentId: string;
    type: string;
    groupJid: string;
    message: any;
    scheduleAt?: string;
    options?: Record<string, any>;
    variables?: Record<string, any>;
    userId?: string;
    label?: string;
  };

  // Validate company
  if (payload.companyId !== request.user?.company) { 
    return reply.status(403).send({ success: false, error: "Unauthorized company" });
  };

  const { agentId, type, message, scheduleAt, companyId } = payload;
  const subject = `v1.agents.${agentId}`;
  const validationError = validateMessageType(type, message);

  if (validationError) {
    return reply.status(400).send({ success: false, error: validationError });
  }

  const jobName = "send-daisi-message"; // unified for now
  const taskPayload = createTaskPayload("DAISI", "send", companyId, {
    ...payload,
    phoneNumber: payload.groupJid, // for compatibility with Task schema
  }, jobName);

  const taskId = await request.server.taskService.create(taskPayload);

  const isScheduled = !!scheduleAt;

  if (isScheduled) {
    const job = await request.server.agenda.schedule(scheduleAt!, jobName, {
      ...payload,
      companyId,
      taskId,
    });

    await request.server.taskService.update(taskId, {
      agendaJobId: job.attrs._id.toString(),
    });

    return reply.status(200).send({
      success: true,
      data: {
        status: "scheduled",
        taskId,
        scheduleAt,
      },
    });
  }

  try {
    const result = await request.server.requestAgentEvent("SEND_MSG_TO_GROUP", subject, {
      ...payload,
      taskId,
    });

    request.log.info("[Daisi] Sent group message to agent", { subject, result });

    if (!result?.success) {
      await request.server.taskService.update(taskId, {
        status: "ERROR",
        errorReason: result?.error || "Unknown failure",
        finishedAt: new Date().toISOString(),
      });

      return reply.status(500).send({ success: false, error: result?.error || "Unknown failure", taskId });
    }

    await request.server.taskService.update(taskId, {
      status: "COMPLETED",
      finishedAt: new Date().toISOString(),
    });

    return reply.status(200).send({
      success: true,
      data: {
        status: "sent",
        taskId,
        result: result.data,
      },
    });
  } catch (err) {
    request.log.error(err, "[Daisi] AgentAPI communication failed");
    await request.server.taskService.update(taskId, "ERROR");
    return reply.status(500).send({ success: false, error: "Agent not responding or failed", taskId });
  }
}

export async function handleMarkAsRead(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const payload = request.body as {
    companyId: string;
    agentId: string;
    remoteJid: string;
    id: string;
  };

  // Validate company
  if (payload.companyId !== request.user?.company) { 
    return reply.status(403).send({ success: false, error: "Unauthorized company" });
  };

  const { agentId } = payload;
  const subject = `v1.agents.${agentId}`;

  try {
    const result = await request.server.requestAgentEvent("MARK_AS_READ", subject, payload);

    if (!result?.success) {
      return reply.status(500).send({ success: false, error: result?.error || "Mark-as-read failed" });
    }

    return reply.status(200).send({
      success: true,
      data: result.data,
    });
  } catch (err: any) {
    request.log.error(err, `[Daisi] Failed to MARK_AS_READ for agent ${agentId}`);
    return reply.status(500).send({ success: false, error: "Agent not responding or failed" });
  }
}

export async function handleLogout(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const payload = request.body as {
    companyId: string;
    agentId: string;
  };

  // Validate company
  if (payload.companyId !== request.user?.company) { 
    return reply.status(403).send({ success: false, error: "Unauthorized company" });
  };

  const { agentId } = payload;
  const subject = `v1.agents.${agentId}`;

  try {
    const result = await request.server.requestAgentEvent("LOGOUT", subject, {});

    if (!result?.success) {
      return reply.status(500).send({ success: false, error: result?.error || "Logout failed" });
    }

    return reply.status(200).send({
      success: true,
      data: result.data,
    });
  } catch (err: any) {
    request.log.error(err, `[Daisi] Failed to LOGOUT for agent ${agentId}`);
    return reply.status(500).send({ success: false, error: "Agent not responding or failed" });
  }
}