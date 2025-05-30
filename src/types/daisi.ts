export interface DaisiMessagePayload {
  agentId: string;
  phoneNumber: string;
  message: {
    text: string;
  };
  scheduleAt?: string;
  options?: Record<string, any>;
  variables?: Record<string, any>;
  userId?: string;
}