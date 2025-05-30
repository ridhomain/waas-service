// src/utils/response.ts
import { FastifyReply } from 'fastify';
import { AppError } from './errors';

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    [key: string]: any;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
  timestamp: string;
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

// Success response helpers
export const sendSuccess = <T>(
  reply: FastifyReply,
  data: T,
  statusCode = 200,
  meta?: SuccessResponse<T>['meta']
): FastifyReply => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  return reply.status(statusCode).send(response);
};

export const sendCreated = <T>(
  reply: FastifyReply,
  data: T,
  meta?: SuccessResponse<T>['meta']
): FastifyReply => {
  return sendSuccess(reply, data, 201, meta);
};

export const sendNoContent = (reply: FastifyReply): FastifyReply => {
  return reply.status(204).send();
};

// Error response helpers
export const sendError = (
  reply: FastifyReply,
  error: AppError | Error | string,
  statusCode?: number,
  code?: string
): FastifyReply => {
  let errorResponse: ErrorResponse;

  if (error instanceof AppError) {
    errorResponse = {
      success: false,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
      timestamp: error.timestamp.toISOString(),
    };
    statusCode = statusCode || error.statusCode;
  } else if (error instanceof Error) {
    errorResponse = {
      success: false,
      error: {
        message: error.message,
        code: code || 'ERROR',
      },
      timestamp: new Date().toISOString(),
    };
    statusCode = statusCode || 500;
  } else {
    errorResponse = {
      success: false,
      error: {
        message: String(error),
        code: code || 'ERROR',
      },
      timestamp: new Date().toISOString(),
    };
    statusCode = statusCode || 400;
  }

  return reply.status(statusCode).send(errorResponse);
};

// Pagination helper
export const createPaginationMeta = (
  total: number,
  page: number,
  limit: number
): SuccessResponse['meta'] => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};