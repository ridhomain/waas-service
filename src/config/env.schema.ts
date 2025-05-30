import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.number().default(80),
  NATS_URL: z.string().default('nats://localhost:4222'),
  MONGODB_DSN: z.string(),
  SECRET_KEY: z.string(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type EnvConfig = z.infer<typeof envSchema>;