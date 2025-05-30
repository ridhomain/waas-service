// src/schemas/task.schema.ts
export const listTasksSchema = {
  querystring: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'ERROR'],
      },
      channel: {
        type: 'string',
        enum: ['DAISI', 'MAILCAST', 'META'],
      },
      type: {
        type: 'string',
        enum: ['send', 'broadcast'],
      },
      label: { type: 'string' },
      agentId: { type: 'string' },
      scheduledBefore: { type: 'string', format: 'date-time' },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
      },
      skip: {
        type: 'integer',
        minimum: 0,
        default: 0,
      },
      page: {
        type: 'integer',
        minimum: 1,
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', const: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              companyId: { type: 'string' },
              agentId: { type: 'string' },
              phoneNumber: { type: 'string' },
              message: { type: 'object' },
              taskType: { type: 'string' },
              channel: { type: 'string' },
              status: { type: 'string' },
              label: { type: 'string', nullable: true },
              scheduledAt: { type: 'string', format: 'date-time', nullable: true },
              finishedAt: { type: 'string', format: 'date-time', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
              agendaJobId: { type: 'string', nullable: true },
              errorReason: { type: 'string', nullable: true },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNext: { type: 'boolean' },
            hasPrev: { type: 'boolean' },
          },
        },
      },
      required: ['success', 'data'],
    },
  },
};

export const getTaskByIdSchema = {
  params: {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
    },
    required: ['id'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', const: true },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            companyId: { type: 'string' },
            agentId: { type: 'string' },
            phoneNumber: { type: 'string' },
            message: { type: 'object' },
            taskType: { type: 'string' },
            channel: { type: 'string' },
            status: { type: 'string' },
            label: { type: 'string', nullable: true },
            scheduledAt: { type: 'string', format: 'date-time', nullable: true },
            finishedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            agendaJobId: { type: 'string', nullable: true },
            errorReason: { type: 'string', nullable: true },
          },
        },
      },
      required: ['success', 'data'],
    },
    400: {
      $ref: '#/components/schemas/errorResponse',
    },
    404: {
      $ref: '#/components/schemas/errorResponse',
    },
  },
};

export const patchTaskByIdSchema = {
  params: {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
    },
    required: ['id'],
  },
  body: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'ERROR'],
      },
      label: { type: 'string' },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', const: true },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            updated: { type: 'boolean' },
          },
          required: ['id', 'updated'],
        },
      },
      required: ['success', 'data'],
    },
    400: {
      $ref: '#/components/schemas/errorResponse',
    },
    404: {
      $ref: '#/components/schemas/errorResponse',
    },
  },
};