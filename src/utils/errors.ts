// src/utils/errors.ts
export interface AppErrorOptions {
  statusCode: number;
  message: string;
  code?: string;
  details?: any;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: any;
  public readonly timestamp: Date;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
    this.timestamp = new Date();

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

// Factory functions for common errors
export const createError = (statusCode: number, message: string, code?: string, details?: any) =>
  new AppError({ statusCode, message, code, details });

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: any) =>
  createError(400, message, code, details);

export const unauthorized = (message = 'Unauthorized', code = 'UNAUTHORIZED') =>
  createError(401, message, code);

export const forbidden = (message = 'Forbidden', code = 'FORBIDDEN', details?: any) =>
  createError(403, message, code, details);

export const notFound = (resource: string, code = 'NOT_FOUND') =>
  createError(404, `${resource} not found`, code);

export const conflict = (message: string, code = 'CONFLICT', details?: any) =>
  createError(409, message, code, details);

export const internalError = (
  message = 'Internal server error',
  code = 'INTERNAL_ERROR',
  details?: any
) => createError(500, message, code, details);

// Error handler
export const handleError = (error: unknown): AppError => {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // MongoDB duplicate key error
  if (error instanceof Error && error.message.includes('E11000')) {
    return conflict('Resource already exists', 'DUPLICATE_KEY');
  }

  // Generic Error
  if (error instanceof Error) {
    return internalError(error.message, 'INTERNAL_ERROR', {
      originalError: error.name,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    });
  }

  // Unknown error
  return internalError('An unknown error occurred', 'UNKNOWN_ERROR');
};
