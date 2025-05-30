import { baileysMessageSchema } from "./baileys-message-schema";

export const sendDaisiMessageSchema = {
  body: {
    type: "object",
    required: ["companyId", "agentId", "phoneNumber", "message", "type"],
    properties: {
      companyId: { type: "string" },
      agentId: { type: "string" },
      phoneNumber: { type: "string" },
      message: baileysMessageSchema,
      type: { type: "string", enum: ["text", "image", "document"] },
      scheduleAt: {
        type: "string",
        format: "date-time",
        nullable: true,
      },
      options: { type: "object", additionalProperties: true, nullable: true },
      variables: { type: "object", additionalProperties: true, nullable: true },
      userId: { type: "string", nullable: true },
      label: { type: "string", nullable: true },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["sent", "scheduled"] },
            taskId: { type: "string" },
            scheduleAt: { type: "string", format: "date-time", nullable: true },
            result: { type: "object", nullable: true },
          },
          required: ["status", "taskId"],
        },
      },
      required: ["success", "data"],
    },
    400: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        error: { type: "string" },
      },
      required: ["success", "error"],
    },
    500: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        error: { type: "string" },
        taskId: { type: "string", nullable: true },
      },
      required: ["success", "error"],
    },
  },
};

export const sendDaisiMessageToGroupSchema = {
  body: {
    type: "object",
    required: ["companyId", "agentId", "groupJid", "message", "type"],
    properties: {
      companyId: { type: "string" },
      agentId: { type: "string" },
      groupJid: { type: "string" },
      message: baileysMessageSchema,
      type: { type: "string", enum: ["text", "image", "document"] },
      scheduleAt: {
        type: "string",
        format: "date-time",
        nullable: true,
      },
      options: { type: "object", additionalProperties: true, nullable: true },
      variables: { type: "object", additionalProperties: true, nullable: true },
      userId: { type: "string", nullable: true },
      label: { type: "string", nullable: true },
    },
    additionalProperties: false,
  },
  response: sendDaisiMessageSchema.response,
};

export const markAsReadSchema = {
  body: {
    type: "object",
    required: ["companyId", "agentId", "remoteJid", "id"],
    properties: {
      companyId: { type: "string" },
      agentId: { type: "string" },
      remoteJid: { type: "string" },
      id: { type: "string" },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: { type: "object", nullable: true },
      },
      required: ["success"],
    },
    500: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        error: { type: "string" },
      },
      required: ["success", "error"],
    },
  },
};

export const logoutSchema = {
  body: {
    type: "object",
    required: ["companyId", "agentId"],
    properties: {
      companyId: { type: "string" },
      agentId: { type: "string" },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        status: { type: "string" },
        result: { type: "object", nullable: true },
      },
      required: ["status"],
    },
    500: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
      required: ["error"],
    },
  },
};

