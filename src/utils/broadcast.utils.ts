import { StringCodec } from 'nats';

const sc = StringCodec();

// Configuration
const FAILURE_RATE_THRESHOLD = 0.1; // 10% failure rate

// Valid status transitions for broadcasts
const validTransitions: Record<BroadcastStatus, BroadcastStatus[]> = {
  SCHEDULED: ['STARTING', 'CANCELLED'],
  STARTING: ['PROCESSING', 'FAILED', 'CANCELLED'],
  PROCESSING: ['PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'],
  PAUSED: ['PROCESSING', 'CANCELLED'], // Direct to PROCESSING
  COMPLETED: [], // Terminal state
  CANCELLED: [], // Terminal state
  FAILED: ['PROCESSING'], // Can retry
};

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

// Check if transition is valid
export function canTransition(from: BroadcastStatus, to: BroadcastStatus): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}

// Derive broadcast status from task statistics
export function deriveBroadcastStatus(state: BroadcastState): BroadcastStatus {
  const { status, total, failed, processed } = state;

  // User-controlled states take precedence
  if (status === 'CANCELLED' || status === 'PAUSED') {
    return status;
  }

  // Not started yet
  if (processed === 0) {
    return state.startedAt ? 'STARTING' : 'SCHEDULED';
  }

  // In progress
  if (processed < total) {
    return 'PROCESSING';
  }

  // All done - check quality
  if (processed === total) {
    const failureRate = total > 0 ? failed / total : 0;
    if (failureRate > FAILURE_RATE_THRESHOLD) {
      return 'FAILED'; // Too many failures
    }
    return 'COMPLETED'; // Success
  }

  return status;
}

// Transition broadcast status with validation
export async function transitionBroadcastStatus(
  kv: any,
  agentId: string,
  batchId: string,
  newStatus: BroadcastStatus,
  metadata?: Partial<BroadcastState>
): Promise<{ success: boolean; error?: string; state?: BroadcastState }> {
  const stateKey = `${agentId}_${batchId}`;

  try {
    const entry = await kv.get(stateKey);
    if (!entry?.value) {
      return { success: false, error: 'Broadcast state not found' };
    }

    const currentState: BroadcastState = JSON.parse(sc.decode(entry.value));

    // Validate transition
    if (!canTransition(currentState.status, newStatus)) {
      return {
        success: false,
        error: `Invalid transition from ${currentState.status} to ${newStatus}`,
      };
    }

    // Update state
    const updatedState: BroadcastState = {
      ...currentState,
      ...metadata,
      status: newStatus,
      lastUpdated: new Date().toISOString(),
    };

    // Add timestamp for specific transitions
    switch (newStatus) {
      case 'STARTING':
        updatedState.startedAt = new Date().toISOString();
        break;
      case 'PAUSED':
        updatedState.pausedAt = new Date().toISOString();
        break;
      case 'PROCESSING':
        // If resuming from pause, clear pause timestamp
        if (currentState.status === 'PAUSED') {
          updatedState.pausedAt = undefined;
        }
        break;
      case 'COMPLETED':
      case 'FAILED':
        updatedState.completedAt = new Date().toISOString();
        break;
      case 'CANCELLED':
        updatedState.cancelledAt = new Date().toISOString();
        break;
    }

    // Save with version check
    await kv.update(stateKey, sc.encode(JSON.stringify(updatedState)), entry.revision);

    return { success: true, state: updatedState };
  } catch (err: any) {
    if (err.message?.includes('wrong last sequence')) {
      return { success: false, error: 'Concurrent update conflict' };
    }
    return { success: false, error: err.message };
  }
}

// Update broadcast progress based on task completion
export async function updateBroadcastProgress(
  kv: any,
  batchId: string,
  agentId: string,
  taskUpdate: { status: 'COMPLETED' | 'ERROR'; phoneNumber: string }
): Promise<void> {
  const stateKey = `${agentId}_${batchId}`;

  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const entry = await kv.get(stateKey);
      if (!entry?.value) return;

      const state: BroadcastState = JSON.parse(sc.decode(entry.value));

      // Update counters based on task status
      switch (taskUpdate.status) {
        case 'COMPLETED':
          state.completed = (state.completed || 0) + 1;
          break;
        case 'ERROR':
          state.failed = (state.failed || 0) + 1;
          break;
      }

      state.processed = state.completed + state.failed;

      // Auto-derive broadcast status if not user-controlled
      if (!['PAUSED', 'CANCELLED'].includes(state.status)) {
        const derivedStatus = deriveBroadcastStatus(state);

        // Only update if status actually changes
        if (derivedStatus !== state.status && canTransition(state.status, derivedStatus)) {
          state.status = derivedStatus;

          // Add completion timestamp if transitioning to terminal state
          if (derivedStatus === 'COMPLETED' || derivedStatus === 'FAILED') {
            state.completedAt = new Date().toISOString();
          }
        }
      }

      state.lastUpdated = new Date().toISOString();

      // Save with version check
      await kv.update(stateKey, sc.encode(JSON.stringify(state)), entry.revision);

      return; // Success
    } catch (err: any) {
      if (err.message?.includes('wrong last sequence') && i < maxRetries - 1) {
        // Retry on version conflict
        continue;
      }
      throw err;
    }
  }
}

// Initialize broadcast state
export function createBroadcastState(params: {
  batchId: string;
  agentId: string;
  companyId: string;
  taskAgent: 'DAISI' | 'META';
  total: number;
  scheduledAt?: Date;
  metadata?: any;
}): BroadcastState {
  const now = new Date().toISOString();

  return {
    status: params.scheduledAt ? 'SCHEDULED' : 'STARTING',
    batchId: params.batchId,
    agentId: params.agentId,
    companyId: params.companyId,
    taskAgent: params.taskAgent,
    total: params.total,
    processed: 0,
    completed: 0,
    failed: 0,
    createdAt: now,
    scheduledAt: params.scheduledAt?.toISOString(),
    lastUpdated: now,
    metadata: params.metadata,
  };
}

// Get broadcast summary with derived status
export function getBroadcastSummary(state: BroadcastState): {
  status: BroadcastStatus;
  progress: number;
  successRate: number;
  failureRate: number;
  isComplete: boolean;
  isTerminal: boolean;
} {
  const derivedStatus = deriveBroadcastStatus(state);
  const progress = state.total > 0 ? (state.processed / state.total) * 100 : 0;
  const successRate = state.processed > 0 ? (state.completed / state.processed) * 100 : 0;
  const failureRate = state.processed > 0 ? (state.failed / state.processed) * 100 : 0;
  const isComplete = state.processed === state.total;
  const isTerminal = ['COMPLETED', 'CANCELLED', 'FAILED'].includes(derivedStatus);

  return {
    status: derivedStatus,
    progress: Math.round(progress),
    successRate: Math.round(successRate),
    failureRate: Math.round(failureRate),
    isComplete,
    isTerminal,
  };
}
