import { companyIdSchema, agentIdSchema, phoneNumberSchema, dateTimeSchema } from './shared.schema';
import { baileysMessageSchema } from './baileys-message.schema';

const successResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', const: true },
    data: { type: 'object' }
  },
  required: ['success', 'data']
};

const errorResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', const: false },
    error: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        code: { type: 'string', nullable: true },
        details: { nullable: true }
      },
      required: ['message']
    },
    timestamp: { type: 'string' }
  },
  required: ['success', 'error', 'timestamp']
};

export const sendDaisiMessageSchema = {
  body: {
    type: 'object',
    required: ['companyId', 'agentId', 'phoneNumber', 'message', 'type'],
    properties: {
      companyId: companyIdSchema,
      agentId: agentIdSchema,
      phoneNumber: phoneNumberSchema,
      message: baileysMessageSchema,
      type: { type: 'string', enum: ['text', 'image', 'document'] },
      scheduleAt: { ...dateTimeSchema, nullable: true },
      options: { type: 'object', additionalProperties: true, nullable: true },
      variables: { type: 'object', additionalProperties: true, nullable: true },
      userId: { type: 'string', nullable: true },
      label: { type: 'string', nullable: true },
    },
    additionalProperties: false,
  },
  response: {
    200: successResponse,
    400: errorResponse,
    403: errorResponse,
    500: errorResponse,
  },
};

export const sendDaisiMessageToGroupSchema = {
  body: {
    type: 'object',
    required: ['companyId', 'agentId', 'groupJid', 'message', 'type'],
    properties: {
      companyId: companyIdSchema,
      agentId: agentIdSchema,
      groupJid: { type: 'string', minLength: 1 },
      message: baileysMessageSchema,
      type: { type: 'string', enum: ['text', 'image', 'document'] },
      scheduleAt: { ...dateTimeSchema, nullable: true },
      options: { type: 'object', additionalProperties: true, nullable: true },
      variables: { type: 'object', additionalProperties: true, nullable: true },
      userId: { type: 'string', nullable: true },
      label: { type: 'string', nullable: true },
    },
    additionalProperties: false,
  },
  response: sendDaisiMessageSchema.response,
};

export const markAsReadSchema = {
  body: {
    type: 'object',
    required: ['companyId', 'agentId', 'remoteJid', 'id'],
    properties: {
      companyId: companyIdSchema,
      agentId: agentIdSchema,
      remoteJid: { type: 'string', minLength: 1 },
      id: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  response: {
    200: successResponse,
    403: errorResponse,
    500: errorResponse,
  },
};

export const logoutSchema = {
  body: {
    type: 'object',
    required: ['companyId', 'agentId'],
    properties: {
      companyId: companyIdSchema,
      agentId: agentIdSchema,
    },
    additionalProperties: false,
  },
  response: {
    200: successResponse,
    403: errorResponse,
    500: errorResponse,
  },
};
