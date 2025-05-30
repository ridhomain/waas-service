// src/handlers/meta.handler.ts (updated version)
import { FastifyRequest, FastifyReply } from 'fastify';
import { Agenda } from '@hokify/agenda';
import { MetaSendMessageInput } from '../schemas/zod-schemas';
import { badRequest, handleError, internalError, unauthorized } from '../utils/errors';
import { sendSuccess, sendError } from '../utils/response';
import { sendToMetaAPI } from '../services/meta.service';
import { AxiosError } from 'axios';
import { nanoid } from '../utils';

interface MetaAPIError {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

export interface MetaHandlerDeps {
  agenda: Agenda;
  log: any; // Fastify logger
}

export const createMetaHandlers = (deps: MetaHandlerDeps) => {
  const { agenda, log } = deps;

  const sendMessage = async (
    request: FastifyRequest<{ Body: MetaSendMessageInput }>,
    reply: FastifyReply
  ) => {
    try {
      const userCompany = request.user?.company;
      if (!userCompany) {
        throw unauthorized('No company ID found');
      }

      const payload = request.body;
      const { type, message, scheduleAt } = payload;

      // Validate message content based on type
      const validationError = validateMetaMessage(type, message);
      if (validationError) {
        throw badRequest(validationError, 'INVALID_MESSAGE_CONTENT');
      }

      // Handle scheduled messages
      if (scheduleAt) {
        try {
          const job = await agenda.schedule(scheduleAt, 'send-meta-message', {
            ...payload,
            companyId: userCompany,
          });

          log.info({ 
            scheduleAt, 
            jobId: nanoid(),
            to: payload.to 
          }, '[Meta] Message scheduled');

          return sendSuccess(reply, {
            status: 'scheduled' as const,
            scheduleAt,
            jobId: nanoid(),
          });
        } catch (err) {
          log.error({ err, scheduleAt }, '[Meta] Failed to schedule message');
          throw internalError('Failed to schedule message', 'SCHEDULING_ERROR');
        }
      }

      // Send immediately
      try {
        log.info({ to: payload.to, type }, '[Meta] Sending message immediately');
        
        const result = await sendToMetaAPI(payload);
        
        log.info({ 
          to: payload.to, 
          messageId: result.messages?.[0]?.id 
        }, '[Meta] Message sent successfully');

        return sendSuccess(reply, {
          status: 'sent' as const,
          result,
        });
      } catch (err) {
        log.error({ err, to: payload.to }, '[Meta] Send failure');
        
        // Extract error details from Meta API response
        const errorMessage = extractMetaErrorMessage(err);
        throw internalError(errorMessage, 'META_API_ERROR');
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

// Helper function to validate Meta message content
function validateMetaMessage(
  type: string,
  message: MetaSendMessageInput['message']
): string | null {
  switch (type) {
    case 'text':
      if (!message.text || message.text.trim().length === 0) {
        return 'Text message content is required';
      }
      break;
    case 'image':
      if (!message.imageUrl) {
        return 'Image URL is required for image messages';
      }
      if (!isValidUrl(message.imageUrl)) {
        return 'Invalid image URL format';
      }
      break;
    case 'document':
      if (!message.documentUrl || !message.filename) {
        return 'Document URL and filename are required for document messages';
      }
      if (!isValidUrl(message.documentUrl)) {
        return 'Invalid document URL format';
      }
      break;
    default:
      return 'Invalid message type';
  }
  return null;
}

// Helper function to validate URLs
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Helper function to extract error message from Meta API errors
function extractMetaErrorMessage(error: unknown): string {
  // Check if it's an Axios error with response
  if (error && typeof error === 'object' && 'isAxiosError' in error) {
    const axiosError = error as AxiosError<MetaAPIError>;
    
    if (axiosError.response?.data?.error?.message) {
      return `Meta API Error: ${axiosError.response.data.error.message}`;
    }
    
    if (axiosError.response?.statusText) {
      return `Meta API Error: ${axiosError.response.status} ${axiosError.response.statusText}`;
    }
    
    if (axiosError.message) {
      return `Meta API Request Failed: ${axiosError.message}`;
    }
  }
  
  // Check if it's a regular Error
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'Meta API request failed';
}