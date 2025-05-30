// src/handlers/mailcast.handler.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { Agenda } from '@hokify/agenda';
import { TaskRepository } from '../repositories/task.repository';
import { MailcastMessagePayload } from '../types/mailcast.types';
import { forbidden, badRequest, handleError, internalError } from '../utils/errors';
import { sendSuccess, sendError } from '../utils/response';
import { validateMessageType } from '../utils/validators';
import { createTaskPayload } from '../utils/task.utils';

export interface MailcastHandlerDeps {
  taskRepository: TaskRepository;
  agenda: Agenda;
  publishEvent: (subject: string, data: any) => Promise<void>;
  log: any; // Fastify logger
}

export const createMailcastHandlers = (deps: MailcastHandlerDeps) => {
  const { taskRepository, agenda, publishEvent, log } = deps;

  const sendMessage = async (
    request: FastifyRequest<{ Body: MailcastMessagePayload }>,
    reply: FastifyReply
  ) => {
    try {
      const payload = request.body;
      const userCompany = request.user?.company;

      // Validate company authorization
      if (payload.companyId !== userCompany) {
        throw forbidden('Unauthorized company access');
      }

      const { type, message, agentId, scheduleAt, companyId } = payload;
      const subject = `v1.mailcast.${agentId}`;

      // Validate message type
      const validationError = validateMessageType(type, message);
      if (validationError) {
        throw badRequest(validationError, 'INVALID_MESSAGE_TYPE');
      }

      // Create task
      const jobName = 'send-mailcast-message';
      const taskPayload = createTaskPayload('MAILCAST', 'send', companyId, payload, jobName);
      const taskId = await taskRepository.create(taskPayload);

      // Handle scheduled messages
      if (scheduleAt) {
        try {
          const job = await agenda.schedule(scheduleAt, jobName, {
            ...payload,
            companyId,
            taskId,
          });

          await taskRepository.update(taskId, {
            agendaJobId: job.attrs._id.toString(),
          });

          log.info({ scheduleAt, taskId, agentId }, '[Mailcast] Message scheduled via Agenda');

          return sendSuccess(reply, {
            status: 'scheduled' as const,
            taskId,
            scheduleAt,
          });
        } catch (err) {
          log.error({ err, taskId }, '[Mailcast] Failed to schedule with Agenda');
          
          // Update task status to error
          await taskRepository.update(taskId, {
            status: 'ERROR',
            errorReason: 'Failed to schedule message',
            finishedAt: new Date(),
          });

          throw internalError('Failed to schedule message', 'SCHEDULING_ERROR');
        }
      }

      // Send immediately via NATS JetStream
      try {
        await taskRepository.update(taskId, { status: 'PROCESSING' });

        await publishEvent(subject, {
          ...payload,
          taskId,
        });

        log.info({ subject, taskId, agentId }, '[Mailcast] Published to JetStream');

        // Note: For mailcast, we don't wait for acknowledgment from the agent
        // The WA Events Processor will handle the actual sending and update the task status

        return sendSuccess(reply, {
          status: 'sent' as const,
          taskId,
        });
      } catch (err) {
        log.error({ err, subject, taskId }, '[Mailcast] Failed to publish to JetStream');

        await taskRepository.update(taskId, {
          status: 'ERROR',
          errorReason: 'Failed to publish message to queue',
          finishedAt: new Date(),
        });

        throw internalError('Failed to send message via NATS', 'NATS_PUBLISH_ERROR');
      }
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  return {
    sendMessage,
  };
};