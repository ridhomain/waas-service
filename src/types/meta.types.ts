export type MetaMessageType = 'text' | 'image' | 'document';

export interface MetaMessagePayload {
  type: MetaMessageType;
  to: string;
  message: {
    text?: string;
    imageUrl?: string;
    documentUrl?: string;
    filename?: string;
  };
  metaCredentials: {
    accessToken: string;
    phoneNumberId: string;
  };
  companyId: string;
  agentId?: string;
  scheduleAt?: string;
}

