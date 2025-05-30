// src/utils/task.ts

import { Task } from '../models/task';

export function createTaskPayload(
  channel: Task["channel"],
  taskType: Task["taskType"],
  companyId: string,
  payload: any,
  jobName?: string
): Omit<Task, '_id' | 'agendaJobId' | 'createdAt' | 'updatedAt'> {
  return {
    companyId,
    agentId: payload.agentId,
    phoneNumber: payload.phoneNumber,
    message: payload.message,
    options: payload.options || {},
    variables: payload.variables || {},
    userId: payload.userId,
    label: payload.label,
    channel,
    taskType,
    status: 'PENDING',
    scheduledAt: payload.scheduleAt ? new Date(payload.scheduleAt) : null,
    jobName,
  };
};
