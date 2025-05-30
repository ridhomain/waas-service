// src/models/task.ts
import { ObjectId } from 'mongodb';

export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';

export type TaskType = 'send' | 'broadcast';

export type TaskChannel = 'DAISI' | 'MAILCAST' | 'META';

export interface Task {
  _id?: ObjectId;
  companyId: string;
  agentId: string;
  messageId?: string;
  phoneNumber: string;
  message: Record<string, any>;
  options?: Record<string, any>;
  variables?: Record<string, any>;
  userId?: string;
  label?: string;
  channel: TaskChannel;
  taskType: TaskType;
  status: TaskStatus;
  errorReason?: string;
  jobName?: string;
  agendaJobId?: string;
  batchId?: string;
  scheduledAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Helper type for API responses (with string id)
export interface TaskResponse extends Omit<Task, '_id'> {
  id: string;
}

export interface TaskFilters {
  status?: TaskStatus;
  channel?: TaskChannel;
  taskType?: TaskType;  // Use the specific type instead of string
  agentId?: string;
  label?: string;
  scheduledBefore?: Date;
}