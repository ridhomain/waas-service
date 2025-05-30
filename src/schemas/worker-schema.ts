import { FastifySchema } from 'fastify';

export const sendCommandSchema: FastifySchema = {
  body: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['PAUSE_BROADCAST', 'REPROCESS_BROADCAST'],
      },
      sender: { type: 'string' },
      batchId: { type: 'string' },
    },
    required: ['action', 'sender', 'batchId'],
  },
};
