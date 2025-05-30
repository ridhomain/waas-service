export interface SendCommandPayload {
  action: string;
  sender: string;
  batchId: string;
}

export interface TestNotificationPayload {
  message: string;
}

export interface StandardResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
