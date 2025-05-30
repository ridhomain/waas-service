// schemas/task-schema.ts

export const listTasksSchema = {
  querystring: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['scheduled', 'failed', 'completed'],
        description: 'Filter by task status',
      },
      channel: {
        type: 'string',
        enum: ['MAILCAST', 'AGENT'],
        description: 'Filter by task channel',
      },
      type: {
        type: 'string',
        enum: ['SEND_MESSAGE', 'LOGOUT', 'MARK_AS_READ'],
        description: 'Filter by task type',
      },
      label: {
        type: 'string',
        description: 'Filter by task label',
      },
      agentId: {
        type: 'string',
        description: 'Filter by agent ID',
      },
      scheduledBefore: {
        type: 'string',
        format: 'date-time',
        description: 'Filter tasks scheduled before a specific ISO datetime',
      },
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
    },
  },
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          companyId: { type: 'string' },
          agentId: { type: 'string' },
          taskType: { type: 'string' },
          channel: { type: 'string' },
          status: { type: 'string' },
          label: { type: 'string', nullable: true },
          payload: { type: 'object' },
          scheduledAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          agendaJobId: { type: 'string', nullable: true },
        },
      },
    },
  },
};

export const getTaskByIdSchema = {
  params: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
    required: ['id'],
  },
};

export const patchTaskByIdSchema = {
  params: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
    required: ['id'],
  },
  body: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['scheduled', 'failed', 'completed', 'PENDING', 'PROCESSING', 'COMPLETED', 'ERROR'],
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
        success: { type: 'boolean' },
        id: { type: 'string' },
      },
      required: ['success', 'id'],
    },
    400: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
      required: ['error'],
    },
    404: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
      required: ['error'],
    },
  },
};
