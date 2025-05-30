import { FastifyReply, FastifyRequest } from "fastify";
import { MetaMessagePayload } from "../types/meta";
import { sendToMetaAPI } from "../services/meta.service";

export async function handleMetaSendMessage(
  request: FastifyRequest<{ Body: MetaMessagePayload }>,
  reply: FastifyReply
) {
  const companyId = request.user?.company;
  const payload = request.body;

  // Conditional validation manually
  const { type, message } = payload;

  if (
    (type === "text" && !message.text) ||
    (type === "image" && !message.imageUrl) ||
    (type === "document" && (!message.documentUrl || !message.filename))
  ) {
    return reply.status(400).send({ error: "Invalid message content for given type" });
  }

  const isScheduled = !!payload.scheduleAt;

  if (isScheduled) {
    await request.server.agenda.schedule(payload.scheduleAt!, "send-meta-message", {...payload, companyId});
    return reply.send({ status: "scheduled", scheduleAt: payload.scheduleAt });
  }

  try {
    const result = await sendToMetaAPI(payload);
    return reply.send({ status: "sent", result });
  } catch (err) {
    request.log.error(err, "[Meta] Send failure");
    return reply.status(500).send({ error: "Meta send failed" });
  }
};
