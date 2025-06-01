// src/schemas/zod-schemas.ts
import { z } from 'zod';

// Base schemas
export const CompanyIdSchema = z.string().min(1, 'Company ID is required');
export const AgentIdSchema = z.string().min(1, 'Agent ID is required');
export const PhoneNumberSchema = z.string().regex(/^\d+$/, 'Phone number must contain only digits');
export const DateTimeSchema = z.string().datetime('Invalid datetime format');

// Message content schemas
export const TextMessageSchema = z.object({
  text: z.string().min(1, 'Text message cannot be empty'),
});

export const ImageMessageSchema = z.object({
  image: z.any(),
  caption: z.string().optional(),
});

export const DocumentMessageSchema = z.object({
  document: z.any(),
  fileName: z.string().min(1, 'Filename is required'),
  mimetype: z.string().min(1, 'MIME type is required'),
  caption: z.string().optional(),
});

export const BaileysMessageSchema = z.union([
  TextMessageSchema,
  ImageMessageSchema,
  DocumentMessageSchema,
]);

// Common fields
export const BaseMessageSchema = z.object({
  companyId: CompanyIdSchema,
  agentId: AgentIdSchema,
  type: z.enum(['text', 'image', 'document']),
  message: BaileysMessageSchema,
  scheduleAt: DateTimeSchema.optional(),
  options: z.record(z.any()).optional(),
  variables: z.record(z.any()).optional(),
  userId: z.string().optional(),
  label: z.string().optional(),
});

// Daisi schemas
export const DaisiSendMessageSchema = BaseMessageSchema.extend({
  phoneNumber: PhoneNumberSchema,
});

export const DaisiSendGroupMessageSchema = BaseMessageSchema.extend({
  groupJid: z.string().min(1, 'Group JID is required'),
});

export const DaisiMarkAsReadSchema = z.object({
  companyId: CompanyIdSchema,
  agentId: AgentIdSchema,
  remoteJid: z.string().min(1, 'Remote JID is required'),
  id: z.string().min(1, 'Message ID is required'),
});

export const DaisiLogoutSchema = z.object({
  companyId: CompanyIdSchema,
  agentId: AgentIdSchema,
});

// Mailcast schemas
export const MailcastSendMessageSchema = BaseMessageSchema.extend({
  phoneNumber: PhoneNumberSchema,
});

// Meta schemas
export const MetaMessageContentSchema = z.object({
  text: z.string().optional(),
  imageUrl: z.string().url().optional(),
  documentUrl: z.string().url().optional(),
  filename: z.string().optional(),
});

export const MetaCredentialsSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  phoneNumberId: z.string().min(1, 'Phone number ID is required'),
});

export const MetaSendMessageSchema = z.object({
  type: z.enum(['text', 'image', 'document']),
  to: z.string().min(1, 'Recipient is required'),
  message: MetaMessageContentSchema,
  metaCredentials: MetaCredentialsSchema,
  companyId: CompanyIdSchema,
  agentId: AgentIdSchema.optional(),
  scheduleAt: DateTimeSchema.optional(),
});

// Task schemas
export const TaskFiltersSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'ERROR']).optional(),
  channel: z.enum(['DAISI', 'MAILCAST', 'META']).optional(),
  type: z.enum(['send', 'broadcast']).optional(),
  label: z.string().optional(),
  agentId: z.string().optional(),
  scheduledBefore: DateTimeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  skip: z.number().int().min(0).default(0),
  page: z.number().int().min(1).optional(),
});

export const TaskUpdateSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'ERROR']).optional(),
  label: z.string().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

// Broadcast schemas
const BaseBroadcastSchema = z.object({
  companyId: CompanyIdSchema,
  agentId: AgentIdSchema,
  type: z.enum(['text', 'image', 'document']),
  message: BaileysMessageSchema,
  options: z.record(z.any()).optional(),
  variables: z.record(z.any()).optional(),
  userId: z.string().optional(),
  label: z.string().optional(),
});

export const BroadcastByTagsSchema = BaseBroadcastSchema.extend({
  tags: z.string().min(1, 'Tags are required'),
  schedule: DateTimeSchema.optional(),
});

export const BroadcastByPhonesSchema = BaseBroadcastSchema.extend({
  phones: z.string().min(1, 'Phone numbers are required'),
  schedule: DateTimeSchema.optional(),
});

export const BroadcastPreviewSchema = z.object({
  companyId: CompanyIdSchema,
  agentId: AgentIdSchema,
  tags: z.string().optional(),
  phones: z.string().optional(),
}).refine(data => data.tags || data.phones, {
  message: 'Either tags or phones must be provided',
});

export const BroadcastStatusSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
});

export const CancelBroadcastSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
});

// Type exports
export type DaisiSendMessageInput = z.infer<typeof DaisiSendMessageSchema>;
export type DaisiSendGroupMessageInput = z.infer<typeof DaisiSendGroupMessageSchema>;
export type DaisiMarkAsReadInput = z.infer<typeof DaisiMarkAsReadSchema>;
export type DaisiLogoutInput = z.infer<typeof DaisiLogoutSchema>;
export type MailcastSendMessageInput = z.infer<typeof MailcastSendMessageSchema>;
export type MetaSendMessageInput = z.infer<typeof MetaSendMessageSchema>;
export type TaskFiltersInput = z.infer<typeof TaskFiltersSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;
export type BroadcastByTagsInput = z.infer<typeof BroadcastByTagsSchema>;
export type BroadcastByPhonesInput = z.infer<typeof BroadcastByPhonesSchema>;
export type BroadcastPreviewInput = z.infer<typeof BroadcastPreviewSchema>;
export type BroadcastStatusInput = z.infer<typeof BroadcastStatusSchema>;
export type CancelBroadcastInput = z.infer<typeof CancelBroadcastSchema>;