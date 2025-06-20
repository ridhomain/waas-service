// src/schemas/zod-schemas.ts
import { z } from 'zod';

// Helper for string-to-number conversion (common in query params)
const stringToNumber = z.string().transform((str, ctx) => {
  const parsed = parseInt(str);
  if (isNaN(parsed)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Not a number',
    });
    return z.NEVER;
  }
  return parsed;
});

const stringToOptionalNumber = z
  .string()
  .transform((str, ctx) => {
    if (str === '' || str === undefined) return undefined;
    const parsed = parseInt(str);
    if (isNaN(parsed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Not a number',
      });
      return z.NEVER;
    }
    return parsed;
  })
  .optional();

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

// Keep the union for backward compatibility
export const BaileysMessageSchema = z.union([
  DocumentMessageSchema,
  ImageMessageSchema,
  TextMessageSchema,
]);

// Common fields for all message schemas
const BaseFieldsSchema = z.object({
  companyId: CompanyIdSchema,
  agentId: AgentIdSchema,
  options: z.record(z.any()).optional(),
  variables: z.record(z.any()).optional(),
  userId: z.string().optional(),
  label: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Daisi schemas (taskType: 'chat', taskAgent: 'DAISI')
export const DaisiSendMessageSchema = z.discriminatedUnion('type', [
  BaseFieldsSchema.extend({
    type: z.literal('text'),
    phoneNumber: PhoneNumberSchema,
    message: TextMessageSchema,
  }),
  BaseFieldsSchema.extend({
    type: z.literal('image'),
    phoneNumber: PhoneNumberSchema,
    message: ImageMessageSchema,
  }),
  BaseFieldsSchema.extend({
    type: z.literal('document'),
    phoneNumber: PhoneNumberSchema,
    message: DocumentMessageSchema,
  }),
]);

export const DaisiSendGroupMessageSchema = z.discriminatedUnion('type', [
  BaseFieldsSchema.extend({
    type: z.literal('text'),
    groupJid: z.string().min(1, 'Group JID is required'),
    message: TextMessageSchema,
  }),
  BaseFieldsSchema.extend({
    type: z.literal('image'),
    groupJid: z.string().min(1, 'Group JID is required'),
    message: ImageMessageSchema,
  }),
  BaseFieldsSchema.extend({
    type: z.literal('document'),
    groupJid: z.string().min(1, 'Group JID is required'),
    message: DocumentMessageSchema,
  }),
]);

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

export const DaisiDownloadMediaSchema = z.object({
  companyId: CompanyIdSchema,
  agentId: AgentIdSchema,
  messageId: z.string().min(1, 'Message ID is required'),
  message: z.any().refine((val) => val !== null && val !== undefined, {
    message: 'Message object is required',
  }),
});

// Mailcast schemas (taskType: 'mailcast', taskAgent: determined by config)
export const MailcastSendMessageSchema = z.discriminatedUnion('type', [
  BaseFieldsSchema.extend({
    type: z.literal('text'),
    phoneNumber: PhoneNumberSchema,
    message: TextMessageSchema,
    scheduleAt: DateTimeSchema,
  }),
  BaseFieldsSchema.extend({
    type: z.literal('image'),
    phoneNumber: PhoneNumberSchema,
    message: ImageMessageSchema,
    scheduleAt: DateTimeSchema,
  }),
  BaseFieldsSchema.extend({
    type: z.literal('document'),
    phoneNumber: PhoneNumberSchema,
    message: DocumentMessageSchema,
    scheduleAt: DateTimeSchema,
  }),
]);

// Meta schemas (taskType: 'chat' or 'mailcast', taskAgent: 'META')
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
  taskType: z.enum(['chat', 'broadcast', 'mailcast']).optional(),
  taskAgent: z.enum(['DAISI', 'META']).optional(),
  label: z.string().optional(),
  agentId: z.string().optional(),
  scheduledBefore: DateTimeSchema.optional(),
  limit: z
    .union([z.number(), stringToNumber])
    .refine((val) => val >= 1 && val <= 100, {
      message: 'Limit must be between 1 and 100',
    })
    .default(20),
  skip: z
    .union([z.number(), stringToNumber])
    .refine((val) => val >= 0, {
      message: 'Skip must be non-negative',
    })
    .default(0),
  page: z
    .union([z.number(), stringToOptionalNumber])
    .refine((val) => val === undefined || val >= 1, {
      message: 'Page must be at least 1',
    })
    .optional(),
});

export const TaskUpdateSchema = z
  .object({
    status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'ERROR']).optional(),
    finishedAt: z.date().optional(),
    errorReason: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

// Broadcast schemas (taskType: 'broadcast')
export const BroadcastByTagsSchema = z.discriminatedUnion('type', [
  BaseFieldsSchema.extend({
    type: z.literal('text'),
    tags: z.string().min(1, 'Tags are required'),
    scheduleAt: DateTimeSchema,
    message: TextMessageSchema,
  }),
  BaseFieldsSchema.extend({
    type: z.literal('image'),
    tags: z.string().min(1, 'Tags are required'),
    scheduleAt: DateTimeSchema,
    message: ImageMessageSchema,
  }),
  BaseFieldsSchema.extend({
    type: z.literal('document'),
    tags: z.string().min(1, 'Tags are required'),
    scheduleAt: DateTimeSchema,
    message: DocumentMessageSchema,
  }),
]);

export const BroadcastPreviewSchema = z
  .object({
    companyId: CompanyIdSchema,
    agentId: AgentIdSchema,
    scheduleAt: DateTimeSchema,
    tags: z.string().optional(),
    phones: z.string().optional(),
  })
  .refine((data) => data.tags || data.phones, {
    message: 'Either tags or phones must be provided',
  });

export const BroadcastStatusSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
});

export const CancelBroadcastSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
});

export const AgentScheduleItemSchema = z.object({
  agentId: AgentIdSchema,
  scheduleAt: DateTimeSchema, // Each agent can have its own schedule
});

export const MultiAgentBroadcastSchema = z.object({
  companyId: CompanyIdSchema,
  agents: z
    .array(AgentScheduleItemSchema)
    .min(1, 'At least one agent is required')
    .refine(
      (agents) => {
        const agentIds = agents.map((a) => a.agentId);
        const uniqueIds = new Set(agentIds);
        return agentIds.length === uniqueIds.size;
      },
      { message: 'Duplicate agent IDs are not allowed' }
    ),
  tags: z.string().min(1, 'Tags are required'),
  type: z.enum(['text', 'image', 'document']),
  message: BaileysMessageSchema,
  options: z.record(z.any()).optional(),
  variables: z.record(z.any()).optional(),
  userId: z.string().optional(),
  label: z.string().optional(),
});

export const MultiAgentBroadcastPreviewSchema = z.object({
  companyId: CompanyIdSchema,
  agents: z
    .array(AgentScheduleItemSchema)
    .min(1, 'At least one agent is required')
    .refine(
      (agents) => {
        const agentIds = agents.map((a) => a.agentId);
        const uniqueIds = new Set(agentIds);
        return agentIds.length === uniqueIds.size;
      },
      { message: 'Duplicate agent IDs are not allowed' }
    ),
  tags: z.string().min(1, 'Tags are required'),
});

// Task type-specific query schemas
export const TaskTypeQuerySchema = z.object({
  agentId: z.string().optional(),
  taskAgent: z.enum(['DAISI', 'META']).optional(),
  limit: z
    .union([z.number(), stringToNumber])
    .refine((val) => val >= 1 && val <= 100, {
      message: 'Limit must be between 1 and 100',
    })
    .default(20),
  skip: z
    .union([z.number(), stringToNumber])
    .refine((val) => val >= 0, {
      message: 'Skip must be non-negative',
    })
    .default(0),
});

export const RescheduleTaskSchema = z.object({
  scheduleAt: DateTimeSchema,
  reason: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Type exports
export type DaisiSendMessageInput = z.infer<typeof DaisiSendMessageSchema>;
export type DaisiSendGroupMessageInput = z.infer<typeof DaisiSendGroupMessageSchema>;
export type DaisiMarkAsReadInput = z.infer<typeof DaisiMarkAsReadSchema>;
export type DaisiLogoutInput = z.infer<typeof DaisiLogoutSchema>;
export type DaisiDownloadMediaInput = z.infer<typeof DaisiDownloadMediaSchema>;
export type MailcastSendMessageInput = z.infer<typeof MailcastSendMessageSchema>;
export type MetaSendMessageInput = z.infer<typeof MetaSendMessageSchema>;
export type TaskFiltersInput = z.infer<typeof TaskFiltersSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;
export type BroadcastByTagsInput = z.infer<typeof BroadcastByTagsSchema>;
export type BroadcastPreviewInput = z.infer<typeof BroadcastPreviewSchema>;
export type BroadcastStatusInput = z.infer<typeof BroadcastStatusSchema>;
export type CancelBroadcastInput = z.infer<typeof CancelBroadcastSchema>;
export type MultiAgentBroadcastInput = z.infer<typeof MultiAgentBroadcastSchema>;
export type MultiAgentBroadcastPreviewInput = z.infer<typeof MultiAgentBroadcastPreviewSchema>;
export type TaskTypeQueryInput = z.infer<typeof TaskTypeQuerySchema>;
export type RescheduleTaskInput = z.infer<typeof RescheduleTaskSchema>;
