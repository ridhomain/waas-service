import { AnyMessageContent } from 'baileys';

export interface MailcastMessagePayload {
  companyId: string;
  agentId: string;
  phoneNumber: string;
  type: 'text' | 'image' | 'document';
  message: AnyMessageContent;
  scheduleAt?: string;
}
