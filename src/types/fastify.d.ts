import { JetStreamClient, JetStreamManager, NatsConnection } from 'nats';
import { Agenda } from '@hokify/agenda';
import { Db } from 'mongodb';
import { TaskRepository } from '../repositories/task.repository';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      company: string;
      token: string;
    };
  }

  interface FastifyInstance {
    // NATS
    nats: NatsConnection;
    js: JetStreamClient;
    jsm: JetStreamManager;
    requestAgentEvent: (action: string, subject: string, payload: any) => Promise<any>;
    publishEvent: (subject: string, data: any) => Promise<void>;
    
    // Auth
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    
    // MongoDB
    mongo: {
      db: Db;
    };
    
    // Repositories
    taskRepository: TaskRepository;
    
    // Agenda
    agenda: Agenda;
    
    // Config
    config: {
      PORT: number;
      NATS_URL: string;
      MONGODB_DSN: string;
      SECRET_KEY: string;
      NODE_ENV?: string;
    };
  }
}