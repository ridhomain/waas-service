import { z } from 'zod';

// Base schemas
export const CompanyIdSchema = z.string().min(1);
export const AgentIdSchema = z.string().min(1);
export const PhoneNumberSchema = z.string().regex(/^\d+$/);

// Message schemas
export const TextMessageSchema = z.object({
  text: z.string().min(1),
});

export const ImageMessageSchema = z.object({
  image: z.any(),
  caption: z.string().optional(),
});

export const DocumentMessageSchema = z.object({
  document: z.any(),
  fileName: z.string(),
  mimetype: z.string(),
  caption: z.string().optional(),
});

export const MessageSchema = z.union([
  TextMessageSchema,
  ImageMessageSchema,
  DocumentMessageSchema,
]);

// Request schemas
export const DaisiSendMessageSchema = z.object({
  companyId: CompanyIdSchema,
  agentId: AgentIdSchema,
  phoneNumber: PhoneNumberSchema,
  type: z.enum(['text', 'image', 'document']),
  message: MessageSchema,
  scheduleAt: z.string().datetime().optional(),
  options: z.record(z.any()).optional(),
  variables: z.record(z.any()).optional(),
  userId: z.string().optional(),
  label: z.string().optional(),
});

export type DaisiSendMessageInput = z.infer<typeof DaisiSendMessageSchema>;