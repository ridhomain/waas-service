import { FastifySchema } from 'fastify';

export const scheduleBroadcastByTagsSchema: FastifySchema = {
  body: {
    type: 'object',
    properties: {
      sender: { type: 'string' },
      schedule: { type: 'string' },
      message: { type: 'object' },
      userId: { type: 'string' },
      label: { type: 'string' },
      variables: { type: 'object' },
      tags: { type: 'string' },
      options: { type: 'object' },
    },
    required: ['sender', 'schedule', 'message', 'tags', 'label'],
  },
};

export const previewScheduleBroadcastByTagsSchema: FastifySchema = {
  body: {
    type: 'object',
    properties: {
      sender: { type: 'string' },
      tags: { type: 'string' },
      schedule: { type: 'string' },
    },
    required: ['sender', 'tags', 'schedule'],
  },
};

export const scheduleBroadcastByPhonesSchema: FastifySchema = {
  body: {
    type: 'object',
    properties: {
      sender: { type: 'string' },
      schedule: { type: 'string' },
      message: { type: 'object' },
      userId: { type: 'string' },
      label: { type: 'string' },
      variables: { type: 'object' },
      phones: { type: 'string' },
      options: { type: 'object' },
    },
    required: ['sender', 'schedule', 'message', 'phones', 'label'],
  },
};

export const scheduleBroadcastMultiSenderSchema: FastifySchema = {
  body: {
    type: 'object',
    properties: {
      sender: {
        type: 'string',
        enum: ['ALL', 'MULTI'],
      },
      senderList: {
        type: 'array',
        items: { type: 'string' },
      },
      scheduleMap: { type: 'object' },
      message: { type: 'object' },
      userId: { type: 'string' },
      label: { type: 'string' },
      variables: { type: 'object' },
      tags: { type: 'string' },
      options: { type: 'object' },
    },
    required: ['sender', 'senderList', 'scheduleMap', 'message', 'label', 'tags'],
  },
};

export const previewScheduleBroadcastMultiSenderSchema: FastifySchema = {
  body: {
    type: 'object',
    properties: {
      sender: {
        type: 'string',
        enum: ['ALL', 'MULTI'],
      },
      senderList: {
        type: 'array',
        items: { type: 'string' },
      },
      scheduleMap: { type: 'object' },
      tags: { type: 'string' },
    },
    required: ['sender', 'senderList', 'scheduleMap', 'tags'],
  },
};

export const cancelBroadcastSchema: FastifySchema = {
  params: {
    type: 'object',
    properties: {
      sender: { type: 'string' },
      batchId: { type: 'string' },
    },
    required: ['sender', 'batchId'],
  },
};
