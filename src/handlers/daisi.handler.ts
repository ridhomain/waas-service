// src/handlers/daisi.handler.ts (updated with new task utils)
import { FastifyRequest, FastifyReply } from 'fastify';
import { Agenda } from '@hokify/agenda';
import { TaskRepository } from '../repositories/task.repository';
import { createError, forbidden, badRequest, handleError } from '../utils/errors';
import { sendSuccess, sendError } from '../utils/response';
import { validateMessageType } from '../utils/validators';
import { createDaisiTaskPayload } from '../utils/task.utils';
import {
  DaisiSendMessageInput,
  DaisiSendGroupMessageInput,
  DaisiMarkAsReadInput,
  DaisiLogoutInput,
} from '../schemas/zod-schemas';

export interface DaisiHandlerDeps {
  taskRepository: TaskRepository;
  agenda: Agenda;
  requestAgentEvent: (action: string, subject: string, payload: any) => Promise<any>;
  log: any; // Fastify logger
}

export const createDaisiHandlers = (deps: DaisiHandlerDeps) => {
  const { taskRepository, agenda, requestAgentEvent, log } = deps;

  const sendMessage = async (
    request: FastifyRequest<{ Body: DaisiSendMessageInput }>,
    reply: FastifyReply
  ) => {
    try {
      const payload = request.body;
      const userCompany = request.user?.company;

      // Validate company authorization
      if (payload.companyId !== userCompany) {
        throw forbidden('Unauthorized company access');
      }

      // Validate message type
      const validationError = validateMessageType(payload.type, payload.message);
      if (validationError) {
        throw badRequest(validationError, 'INVALID_MESSAGE_TYPE');
      }

      // Create task using the new specific function
      const taskPayload = createDaisiTaskPayload('send', payload.companyId, payload, 'send-daisi-message');
      const taskId = await taskRepository.create(taskPayload);

      // Handle scheduled messages
      if (payload.scheduleAt) {
        const job = await agenda.schedule(payload.scheduleAt, 'send-daisi-message', {
          ...payload,
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

        return sendSuccess(reply, {
          status: 'scheduled' as const,
          taskId,
          scheduleAt: payload.scheduleAt,
        });
      }

      // Send immediately
      await taskRepository.update(taskId, { status: 'PROCESSING' });
      
      const subject = `v1.agents.${payload.agentId}`;
      const result = await requestAgentEvent('SEND_MSG', subject, {
        ...payload,
        taskId,
      });

      if (!result?.success) {
        await taskRepository.update(taskId, {
          status: 'ERROR',
          errorReason: result?.error || 'Unknown failure',
          finishedAt: new Date(),
        });
        throw createError(500, result?.error || 'Agent communication failed', 'AGENT_ERROR');
      }

      await taskRepository.update(taskId, {
        status: 'COMPLETED',
        finishedAt: new Date(),
      });

      return sendSuccess(reply, {
        status: 'sent' as const,
        taskId,
        result: result.data,
      });
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const sendMessageToGroup = async (
    request: FastifyRequest<{ Body: DaisiSendGroupMessageInput }>,
    reply: FastifyReply
  ) => {
    try {
      const payload = request.body;
      const userCompany = request.user?.company;

      if (payload.companyId !== userCompany) {
        throw forbidden('Unauthorized company access');
      }

      const validationError = validateMessageType(payload.type, payload.message);
      if (validationError) {
        throw badRequest(validationError, 'INVALID_MESSAGE_TYPE');
      }

      // Create task using the new specific function (groupJid will be used as phoneNumber)
      const taskPayload = createDaisiTaskPayload('send', payload.companyId, payload, 'send-daisi-message');
      const taskId = await taskRepository.create(taskPayload);

      if (payload.scheduleAt) {
        const job = await agenda.schedule(payload.scheduleAt, 'send-daisi-message', {
          ...payload,
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

        return sendSuccess(reply, {
          status: 'scheduled' as const,
          taskId,
          scheduleAt: payload.scheduleAt,
        });
      }

      await taskRepository.update(taskId, { status: 'PROCESSING' });
      
      const subject = `v1.agents.${payload.agentId}`;
      const result = await requestAgentEvent('SEND_MSG_TO_GROUP', subject, {
        ...payload,
        taskId,
      });

      if (!result?.success) {
        await taskRepository.update(taskId, {
          status: 'ERROR',
          errorReason: result?.error || 'Unknown failure',
          finishedAt: new Date(),
        });
        throw createError(500, result?.error || 'Agent communication failed', 'AGENT_ERROR');
      }

      await taskRepository.update(taskId, {
        status: 'COMPLETED',
        finishedAt: new Date(),
      });

      return sendSuccess(reply, {
        status: 'sent' as const,
        taskId,
        result: result.data,
      });
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const markAsRead = async (
    request: FastifyRequest<{ Body: DaisiMarkAsReadInput }>,
    reply: FastifyReply
  ) => {
    try {
      const payload = request.body;
      const userCompany = request.user?.company;

      if (payload.companyId !== userCompany) {
        throw forbidden('Unauthorized company access');
      }

      const subject = `v1.agents.${payload.agentId}`;
      const result = await requestAgentEvent('MARK_AS_READ', subject, payload);

      if (!result?.success) {
        throw createError(500, result?.error || 'Mark as read failed', 'AGENT_ERROR');
      }

      return sendSuccess(reply, result.data || {});
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const logout = async (
    request: FastifyRequest<{ Body: DaisiLogoutInput }>,
    reply: FastifyReply
  ) => {
    try {
      const payload = request.body;
      const userCompany = request.user?.company;

      if (payload.companyId !== userCompany) {
        throw forbidden('Unauthorized company access');
      }

      const subject = `v1.agents.${payload.agentId}`;
      const result = await requestAgentEvent('LOGOUT', subject, {});

      if (!result?.success) {
        throw createError(500, result?.error || 'Logout failed', 'AGENT_ERROR');
      }

      return sendSuccess(reply, {
        timestamp: new Date().toISOString(),
        ...result.data,
      });
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  return {
    sendMessage,
    sendMessageToGroup,
    markAsRead,
    logout,
  };
};