import { Task, TaskChannel, TaskType } from '../models/task';

export const createTaskPayload = (
  channel: TaskChannel,
  taskType: TaskType,
  companyId: string,
  payload: any,
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => ({
  companyId,
  agentId: payload.agentId,
  phoneNumber: payload.phoneNumber || payload.groupJid,
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
  batchId: payload.batchId,
});
