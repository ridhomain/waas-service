// src/agenda/jobs/send-meta-message.ts
import { Agenda, Job } from "@hokify/agenda";
import { sendToMetaAPI } from "../../services/meta.service";
import { MetaMessagePayload } from "../../types/meta.types";

export const defineSendMetaMessageJob = (agenda: Agenda) => {
  agenda.define("send-meta-message", async (job: Job<MetaMessagePayload>) => {
    const payload = job.attrs.data;

    if (!payload) {
      throw new Error("Missing payload");
    }

    try {
      const result = await sendToMetaAPI(payload);
      
      // Store result in job attributes
      (job.attrs as any).result = result;
      
      // Log success
      console.log(`[Agenda] Meta message sent successfully to ${payload.to}`);
    } catch (err) {
      console.error("[Agenda] Failed to send meta message", err);
      throw err; // Re-throw to mark job as failed
    }
  });
};
