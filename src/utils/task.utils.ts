// src/utils/task.utils.ts (alternative approach with separate functions)
import { Task, TaskChannel, TaskType } from '../models/task';
import { DaisiSendMessageInput, DaisiSendGroupMessageInput, MailcastSendMessageInput, MetaSendMessageInput } from '../schemas/zod-schemas';

const createBaseTaskPayload = (
  channel: TaskChannel,
  taskType: TaskType,
  companyId: string,
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt' | 'agentId' | 'phoneNumber' | 'message' | 'options' | 'variables' | 'userId' | 'label' | 'scheduledAt'> => ({
  companyId,
  channel,
  taskType,
  status: 'PENDING',
  jobName,
  batchId: undefined,
});

export const createDaisiTaskPayload = (
  taskType: TaskType,
  companyId: string,
  payload: DaisiSendMessageInput | DaisiSendGroupMessageInput,
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => {
  // Handle both regular messages and group messages
  const phoneNumber = 'phoneNumber' in payload ? payload.phoneNumber : payload.groupJid;
  
  return {
    ...createBaseTaskPayload('DAISI', taskType, companyId, jobName),
    agentId: payload.agentId,
    phoneNumber,
    message: payload.message,
    options: payload.options || {},
    variables: payload.variables || {},
    userId: payload.userId,
    label: payload.label,
    scheduledAt: payload.scheduleAt ? new Date(payload.scheduleAt) : null,
  };
};

export const createMailcastTaskPayload = (
  taskType: TaskType,
  companyId: string,
  payload: MailcastSendMessageInput,
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => ({
  ...createBaseTaskPayload('MAILCAST', taskType, companyId, jobName),
  agentId: payload.agentId,
  phoneNumber: payload.phoneNumber,
  message: payload.message,
  options: payload.options || {},
  variables: payload.variables || {},
  userId: payload.userId,
  label: payload.label,
  scheduledAt: payload.scheduleAt ? new Date(payload.scheduleAt) : null,
});

export const createMetaTaskPayload = (
  taskType: TaskType,
  companyId: string,
  payload: MetaSendMessageInput,
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => ({
  ...createBaseTaskPayload('META', taskType, companyId, jobName),
  agentId: payload.agentId || '',
  phoneNumber: payload.to,
  message: payload.message,
  options: {},
  variables: {},
  userId: undefined,
  label: undefined,
  scheduledAt: payload.scheduleAt ? new Date(payload.scheduleAt) : null,
});

// Keep the old function for backward compatibility, but mark it as deprecated
/** @deprecated Use createDaisiTaskPayload, createMailcastTaskPayload, or createMetaTaskPayload instead */
export const createTaskPayload = (
  channel: TaskChannel,
  taskType: TaskType,
  companyId: string,
  payload: DaisiSendMessageInput | DaisiSendGroupMessageInput | MailcastSendMessageInput | MetaSendMessageInput,
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => {
  switch (channel) {
    case 'DAISI':
      return createDaisiTaskPayload(taskType, companyId, payload as DaisiSendMessageInput | DaisiSendGroupMessageInput, jobName);
    case 'MAILCAST':
      return createMailcastTaskPayload(taskType, companyId, payload as MailcastSendMessageInput, jobName);
    case 'META':
      return createMetaTaskPayload(taskType, companyId, payload as MetaSendMessageInput, jobName);
    default:
      throw new Error(`Unsupported channel: ${channel}`);
  }
};