// src/handlers/mailcast.handler.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { Agenda } from '@hokify/agenda';
import { TaskRepository } from '../repositories/task.repository';
import { MailcastSendMessageInput } from '../schemas/zod-schemas';
import { forbidden, badRequest, handleError, internalError } from '../utils/errors';
import { sendSuccess, sendError } from '../utils/response';
import { validateMessageType } from '../utils/validators';
import { createMailcastTaskPayload } from '../utils/task.utils';

export interface MailcastHandlerDeps {
  taskRepository: TaskRepository;
  agenda: Agenda;
  publishEvent: (subject: string, data: any) => Promise<void>;
  log: any; // Fastify logger
}

export const createMailcastHandlers = (deps: MailcastHandlerDeps) => {
  const { taskRepository, agenda, publishEvent, log } = deps;

  const sendMessage = async (
    request: FastifyRequest<{ Body: MailcastSendMessageInput }>,
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
      const subject = `v1.mailcasts.${agentId}`;

      // Validate message type
      const validationError = validateMessageType(type, message);
      if (validationError) {
        throw badRequest(validationError, 'INVALID_MESSAGE_TYPE');
      }

      // Create task using the new specific function (taskType: 'mailcast', taskAgent: 'DAISI' by default)
      // Note: taskAgent can be configured per company/agent basis in the future
      const jobName = 'send-mailcast-message';
      const taskPayload = createMailcastTaskPayload(companyId, payload, 'DAISI', jobName);
      const taskId = await taskRepository.create(taskPayload);

      // Handle scheduled messages
      if (scheduleAt) {
        try {
          const job = await agenda.schedule(scheduleAt, jobName, {
            ...payload,
            companyId,
            taskId,
          });

          const jobId = job.attrs._id;
          if (jobId) {
            await taskRepository.update(taskId, {
              agendaJobId: jobId.toString(),
            });
          } else {
            log.warn({ taskId }, 'Agenda job created without ID');
          }

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