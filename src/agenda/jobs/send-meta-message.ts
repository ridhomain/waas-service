import { Agenda, Job } from "@hokify/agenda";
import { sendToMetaAPI } from "../../services/meta.service";
import { MetaMessagePayload } from "../../types/meta.types";

export const defineSendMetaMessageJob = (agenda: Agenda) => {
  agenda.define("send-meta-message", async (job: Job<MetaMessagePayload>) => {
    const payload = job.attrs.data;

    if (!payload) {
      job.fail("Missing payload");
      return;
    }

    try {
      const result = await sendToMetaAPI(payload);
      (job.attrs as any).result = result;
    } catch (err) {
      console.error("[Agenda] Failed to send meta message", err);
      job.fail(err as Error);
    }
  });
};
