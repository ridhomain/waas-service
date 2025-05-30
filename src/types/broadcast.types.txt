export interface BroadcastPayloadBase {
  sender: string;
  schedule?: string;
  message: any;
  userId: string;
  label: string;
  variables?: Record<string, any>;
  options?: Record<string, any>;
}

export interface BroadcastByTagsPayload extends BroadcastPayloadBase {
  tags: string;
}

export interface BroadcastByPhonesPayload extends BroadcastPayloadBase {
  phones: string;
}

export interface BroadcastMultiSenderPayload {
  senderList: string[];
  scheduleMap: Record<string, string>;
  message: any;
  userId: string;
  label: string;
  variables?: Record<string, any>;
  options?: Record<string, any>;
  tags: string;
}

export interface CancelBroadcastPayload {
  batchId: string;
  sender: string;
}

export interface PreviewScheduleByTagsPayload {
  sender: string;
  schedule?: string;
  tags: string;
}

export interface ScheduleByPhonesPayload {
  schedule: string;
  sender: string;
  message: any;
  userId: string;
  label: string;
  variables?: Record<string, any>;
  phones: string;
  options?: Record<string, any>;
  tags?: string;
}

export interface ScheduleMultiSenderPayload {
  scheduleMap: Record<string, string>;
  senderList: string[];
  message: any;
  userId: string;
  label: string;
  variables?: Record<string, any>;
  tags: string;
  options?: Record<string, any>;
}

export interface CancelBroadcastPayload {
  batchId: string;
  sender: string;
}

export interface SendBroadcastNowPayload {
  sender: string;
  message: any;
  userId: string;
  label: string;
  variables?: Record<string, any>;
  tags: string;
  options?: Record<string, any>;
}
