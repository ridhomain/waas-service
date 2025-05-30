// src/schemas/meta.schema.ts
import { companyIdSchema, agentIdSchema, dateTimeSchema } from './shared.schema';

export const sendMetaMessageSchema = {
  body: {
    type: 'object',
    required: ['type', 'to', 'message', 'metaCredentials', 'companyId'],
    properties: {
      type: { type: 'string', enum: ['text', 'image', 'document'] },
      to: { type: 'string', minLength: 1 },
      message: {
        type: 'object',
        properties: {
          text: { type: 'string', nullable: true },
          imageUrl: { type: 'string', format: 'uri', nullable: true },
          documentUrl: { type: 'string', format: 'uri', nullable: true },
          filename: { type: 'string', nullable: true },
        },
        additionalProperties: false,
      },
      metaCredentials: {
        type: 'object',
        required: ['accessToken', 'phoneNumberId'],
        properties: {
          accessToken: { type: 'string', minLength: 1 },
          phoneNumberId: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
      companyId: companyIdSchema,
      agentId: { ...agentIdSchema, nullable: true },
      scheduleAt: { ...dateTimeSchema, nullable: true },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', const: true },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['sent', 'scheduled'] },
            scheduleAt: { type: 'string', format: 'date-time', nullable: true },
            jobId: { type: 'string', nullable: true },
            result: { type: 'object', nullable: true },
          },
          required: ['status'],
        },
      },
      required: ['success', 'data'],
    },
    400: {
      $ref: '#/components/schemas/errorResponse',
    },
    401: {
      $ref: '#/components/schemas/errorResponse',
    },
    500: {
      $ref: '#/components/schemas/errorResponse',
    },
  },
};

