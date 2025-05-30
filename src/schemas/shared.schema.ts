export const companyIdSchema = { type: 'string', minLength: 1 };
export const agentIdSchema = { type: 'string', minLength: 1 };
export const phoneNumberSchema = { type: 'string', pattern: '^\\d+$' };
export const dateTimeSchema = { type: 'string', format: 'date-time' };
