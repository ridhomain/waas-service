export const envSchema = {
  type: 'object',
  required: [
    'NATS_URL',
    'MONGODB_DSN',
    'SECRET_KEY',
  ],
  properties: {
    PORT: { type: 'number', default: 80 },
    NATS_URL: { type: 'string', default: 'nats://localhost:4222' },
    MONGODB_DSN: { type: 'string', default: '' },
    SECRET_KEY: { type: 'string', default: '' },
  },
} as const;
