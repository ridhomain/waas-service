// src/models/task.ts
import { ObjectId } from 'mongodb';

export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';

// Updated: TaskType now represents the message flow/origin
export type TaskType = 'chat' | 'broadcast' | 'mailcast';

// Updated: TaskAgent represents which agent/system sends the message
export type TaskAgent = 'DAISI' | 'META';

export type TaskMetadata = any;

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
  taskType: TaskType;
  taskAgent: TaskAgent;
  metadata?: TaskMetadata;
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
  taskType?: TaskType; // Updated from 'channel' to 'taskType'
  taskAgent?: TaskAgent; // Updated from 'channel' to 'taskAgent'
  agentId?: string;
  label?: string;
  scheduledBefore?: Date;
}
