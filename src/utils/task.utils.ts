// src/utils/task.utils.ts
import { Task, TaskAgent, TaskType } from '../models/task';
import { DaisiSendMessageInput, DaisiSendGroupMessageInput, MailcastSendMessageInput, MetaSendMessageInput } from '../schemas/zod-schemas';

const createBaseTaskPayload = (
  taskType: TaskType,
  taskAgent: TaskAgent,
  companyId: string,
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt' | 'agentId' | 'phoneNumber' | 'message' | 'options' | 'variables' | 'userId' | 'label' | 'scheduledAt'> => ({
  companyId,
  taskType,
  taskAgent,
  status: 'PENDING',
  jobName,
  batchId: undefined,
});

/**
 * Create task payload for Daisi chat messages
 * taskType: 'chat', taskAgent: 'DAISI'
 */
export const createDaisiChatTaskPayload = (
  companyId: string,
  payload: DaisiSendMessageInput | DaisiSendGroupMessageInput,
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => {
  // Handle both regular messages and group messages
  const phoneNumber = 'phoneNumber' in payload ? payload.phoneNumber : payload.groupJid;
  
  return {
    ...createBaseTaskPayload('chat', 'DAISI', companyId, jobName),
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

/**
 * Create task payload for Daisi broadcast messages
 * taskType: 'broadcast', taskAgent: 'DAISI'
 */
export const createDaisiBroadcastTaskPayload = (
  companyId: string,
  payload: {
    agentId: string;
    phoneNumber: string;
    message: any;
    options?: any;
    variables?: any;
    userId?: string;
    label?: string;
    scheduledAt?: Date;
    batchId?: string;
  },
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => ({
  ...createBaseTaskPayload('broadcast', 'DAISI', companyId, jobName),
  agentId: payload.agentId,
  phoneNumber: payload.phoneNumber,
  message: payload.message,
  options: payload.options || {},
  variables: payload.variables || {},
  userId: payload.userId,
  label: payload.label,
  scheduledAt: payload.scheduledAt || null,
  batchId: payload.batchId,
});

/**
 * Create task payload for Mailcast messages (email->WhatsApp forwarding)
 * taskType: 'mailcast', taskAgent: determined by configuration
 */
export const createMailcastTaskPayload = (
  companyId: string,
  payload: MailcastSendMessageInput,
  taskAgent: TaskAgent = 'DAISI', // Default to DAISI, can be overridden
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => ({
  ...createBaseTaskPayload('mailcast', taskAgent, companyId, jobName),
  agentId: payload.agentId,
  phoneNumber: payload.phoneNumber,
  message: payload.message,
  options: payload.options || {},
  variables: payload.variables || {},
  userId: payload.userId,
  label: payload.label,
  scheduledAt: payload.scheduleAt ? new Date(payload.scheduleAt) : null,
});

/**
 * Create task payload for Meta chat messages
 * taskType: 'chat', taskAgent: 'META'
 */
export const createMetaChatTaskPayload = (
  companyId: string,
  payload: MetaSendMessageInput,
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => ({
  ...createBaseTaskPayload('chat', 'META', companyId, jobName),
  agentId: payload.agentId || '',
  phoneNumber: payload.to,
  message: payload.message,
  options: { metaCredentials: payload.metaCredentials },
  variables: {},
  userId: undefined,
  label: undefined,
  scheduledAt: payload.scheduleAt ? new Date(payload.scheduleAt) : null,
});

/**
 * Create task payload for Meta broadcast messages
 * taskType: 'broadcast', taskAgent: 'META'
 */
export const createMetaBroadcastTaskPayload = (
  companyId: string,
  payload: {
    agentId: string;
    phoneNumber: string;
    message: any;
    options?: any;
    variables?: any;
    userId?: string;
    label?: string;
    scheduledAt?: Date;
    batchId?: string;
    metaCredentials: any;
  },
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => ({
  ...createBaseTaskPayload('broadcast', 'META', companyId, jobName),
  agentId: payload.agentId,
  phoneNumber: payload.phoneNumber,
  message: payload.message,
  options: { 
    ...payload.options,
    metaCredentials: payload.metaCredentials 
  },
  variables: payload.variables || {},
  userId: payload.userId,
  label: payload.label,
  scheduledAt: payload.scheduledAt || null,
  batchId: payload.batchId,
});

/**
 * Create task payload for Meta mailcast messages
 * taskType: 'mailcast', taskAgent: 'META'
 */
export const createMetaMailcastTaskPayload = (
  companyId: string,
  payload: MailcastSendMessageInput & { metaCredentials: any },
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => ({
  ...createBaseTaskPayload('mailcast', 'META', companyId, jobName),
  agentId: payload.agentId,
  phoneNumber: payload.phoneNumber,
  message: payload.message,
  options: { 
    ...payload.options,
    metaCredentials: payload.metaCredentials 
  },
  variables: payload.variables || {},
  userId: payload.userId,
  label: payload.label,
  scheduledAt: payload.scheduleAt ? new Date(payload.scheduleAt) : null,
});

// Keep the old function for backward compatibility, but mark it as deprecated
/** @deprecated Use specific task creation functions instead */
export const createTaskPayload = (
  taskType: TaskType,
  taskAgent: TaskAgent,
  companyId: string,
  payload: any,
  jobName?: string
): Omit<Task, '_id' | 'createdAt' | 'updatedAt'> => {
  switch (`${taskType}-${taskAgent}`) {
    case 'chat-DAISI':
      return createDaisiChatTaskPayload(companyId, payload, jobName);
    case 'mailcast-DAISI':
      return createMailcastTaskPayload(companyId, payload, 'DAISI', jobName);
    case 'chat-META':
      return createMetaChatTaskPayload(companyId, payload, jobName);
    case 'mailcast-META':
      return createMetaMailcastTaskPayload(companyId, payload, jobName);
    default:
      throw new Error(`Unsupported combination: taskType=${taskType}, taskAgent=${taskAgent}`);
  }
};