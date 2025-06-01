// src/config/env.schema.ts (fixed for @fastify/env)
export const envSchema = {
  type: 'object',
  required: ['MONGODB_DSN', 'SECRET_KEY', 'NATS_URL', 'POSTGRES_DSN'],
  properties: {
    PORT: {
      type: 'integer',
      default: 80
    },
    NATS_URL: {
      type: 'string',
      default: 'nats://localhost:4222'
    },
    MONGODB_DSN: {
      type: 'string'
    },
    SECRET_KEY: {
      type: 'string'
    },
    POSTGRES_DSN: {
      type: 'string'
    },
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'production', 'test'],
      default: 'development'
    }
  }
};

// Keep Zod schema for type inference if needed elsewhere
import { z } from 'zod';

export const zodEnvSchema = z.object({
  PORT: z.number().default(80),
  NATS_URL: z.string().default('nats://localhost:4222'),
  MONGODB_DSN: z.string(),
  POSTGRES_DSN: z.string(),
  SECRET_KEY: z.string(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type EnvConfig = z.infer<typeof zodEnvSchema>;