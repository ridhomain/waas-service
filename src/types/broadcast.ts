export type BroadcastStatus =
  | 'SCHEDULED' // Waiting for scheduled time
  | 'STARTING' // Initializing (sending START signal)
  | 'PROCESSING' // Actively sending messages
  | 'PAUSED' // Temporarily stopped by user
  | 'COMPLETED' // All messages processed successfully (<=10% failure)
  | 'CANCELLED' // Permanently stopped by user
  | 'FAILED'; // All messages processed but >10% failed

// Broadcast state interface
export interface BroadcastState {
  status: BroadcastStatus;
  batchId: string;
  agentId: string;
  companyId: string;
  taskAgent: 'DAISI' | 'META';
  total: number;
  processed: number;
  completed: number;
  failed: number;
  createdAt: string;
  scheduledAt?: string;
  startedAt?: string;
  pausedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  lastError?: string;
  lastUpdated?: string;
  metadata?: any;
}
