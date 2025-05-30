import { baileysMessageSchema } from "./baileys-message-schema";

export const sendMailcastMessageSchema = {
  body: {
    type: "object",
    required: ["companyId", "agentId", "phoneNumber", "message", "type"],
    properties: {
      companyId: { type: "string" },
      agentId: { type: "string" },
      phoneNumber: { type: "string" },
      type: { type: "string", enum: ["text", "image", "document"] },
      message: baileysMessageSchema,
      scheduleAt: {
        type: "string",
        format: "date-time",
        nullable: true,
      },
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
