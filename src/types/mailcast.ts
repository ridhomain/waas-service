import { AnyMessageContent } from "baileys";

export type MailcastMessageType = "text" | "image" | "document";

export interface MailcastMessagePayload {
  companyId: string;
  agentId: string;
  type: string;
  phoneNumber: string;
  message: AnyMessageContent;
  scheduleAt?: string;
}
