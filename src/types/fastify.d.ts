import 'fastify';
import { JetStreamClient, JetStreamManager } from 'nats';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      company: string | undefined;
      token: string;
    };
  }

  interface FastifyInstance {
    js: JetStreamClient;
    jsm: JetStreamManager;
    requestAgentEvent: any;
    publishEvent: any;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    mongo: {
      db: Db;
    };
    taskService: TaskService;
    redis: {
      client: Redis.Redis;
    };
    agenda: Agenda;
    config: {
      PORT: number;
      NATS_URL: string;
      MONGODB_DSN: string;
      AGENDA_DSN: string;
      SECRET_KEY: string;
    };
  }
}
