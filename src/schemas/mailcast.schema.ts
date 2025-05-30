import { companyIdSchema, agentIdSchema, phoneNumberSchema, dateTimeSchema } from './shared.schema';
import { baileysMessageSchema } from './baileys-message.schema';

export const sendMailcastMessageSchema = {
  body: {
    type: 'object',
    required: ['companyId', 'agentId', 'phoneNumber', 'message', 'type'],
    properties: {
      companyId: companyIdSchema,
      agentId: agentIdSchema,
      phoneNumber: phoneNumberSchema,
      type: { type: 'string', enum: ['text', 'image', 'document'] },
      message: baileysMessageSchema,
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
            taskId: { type: 'string' },
            scheduleAt: { type: 'string', format: 'date-time', nullable: true },
          },
          required: ['status', 'taskId'],
        },
      },
      required: ['success', 'data'],
    },
    400: {
      type: 'object',
      properties: {
        success: { type: 'boolean', const: false },
        error: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            code: { type: 'string', nullable: true },
          },
          required: ['message'],
        },
        timestamp: { type: 'string' },
      },
      required: ['success', 'error', 'timestamp'],
    },
    403: {
      $ref: '#/components/schemas/errorResponse',
    },
    500: {
      $ref: '#/components/schemas/errorResponse',
    },
  },
};
