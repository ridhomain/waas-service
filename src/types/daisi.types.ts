import { AnyMessageContent } from 'baileys';

export interface DaisiMessagePayload {
  companyId: string;
  agentId: string;
  phoneNumber: string;
  type: 'text' | 'image' | 'document';
  message: AnyMessageContent;
  scheduleAt?: string;
  options?: Record<string, any>;
  variables?: Record<string, any>;
  userId?: string;
  label?: string;
}

export interface DaisiGroupMessagePayload extends Omit<DaisiMessagePayload, 'phoneNumber'> {
  groupJid: string;
}

export interface MarkAsReadPayload {
  companyId: string;
  agentId: string;
  remoteJid: string;
  id: string;
}

export interface LogoutPayload {
  companyId: string;
  agentId: string;
}