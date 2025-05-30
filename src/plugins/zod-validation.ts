// src/plugins/zod-validation.ts
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { ZodSchema, ZodError } from 'zod';
import { badRequest, handleError } from '../utils/errors';
import { sendError } from '../utils/response';

interface ZodValidationOptions {
  body?: ZodSchema;
  querystring?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}

declare module 'fastify' {
  interface FastifyInstance {
    zodValidate: (schemas: ZodValidationOptions) => (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

const zodValidationPlugin: FastifyPluginAsync = async (fastify) => {
  const zodValidate = (schemas: ZodValidationOptions) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Validate body
        if (schemas.body && request.body !== undefined) {
          const result = schemas.body.safeParse(request.body);
          if (!result.success) {
            const errors = formatZodErrors(result.error);
            throw badRequest('Request body validation failed', 'VALIDATION_ERROR', errors);
          }
          request.body = result.data;
        }

        // Validate query parameters
        if (schemas.querystring && request.query !== undefined) {
          const result = schemas.querystring.safeParse(request.query);
          if (!result.success) {
            const errors = formatZodErrors(result.error);
            throw badRequest('Query parameters validation failed', 'VALIDATION_ERROR', errors);
          }
          request.query = result.data;
        }

        // Validate path parameters
        if (schemas.params && request.params !== undefined) {
          const result = schemas.params.safeParse(request.params);
          if (!result.success) {
            const errors = formatZodErrors(result.error);
            throw badRequest('Path parameters validation failed', 'VALIDATION_ERROR', errors);
          }
          request.params = result.data;
        }

        // Validate headers
        if (schemas.headers && request.headers !== undefined) {
          const result = schemas.headers.safeParse(request.headers);
          if (!result.success) {
            const errors = formatZodErrors(result.error);
            throw badRequest('Headers validation failed', 'VALIDATION_ERROR', errors);
          }
        }
      } catch (error) {
        const appError = handleError(error);
        return sendError(reply, appError);
      }
    };
  };

  fastify.decorate('zodValidate', zodValidate);
};

function formatZodErrors(error: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    const field = path || 'root';
    
    if (!errors[field]) {
      errors[field] = [];
    }
    
    errors[field].push(issue.message);
  }
  
  return errors;
}

export default fp(zodValidationPlugin, {
  name: 'zod-validation',
});