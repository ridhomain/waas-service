export const sendMetaMessageSchema = {
  body: {
    type: "object",
    required: ["type", "to", "message", "metaCredentials", "companyId"],
    properties: {
      type: { type: "string", enum: ["text", "image", "document"] },
      to: { type: "string" },
      message: {
        type: "object",
        properties: {
          text: { type: "string" },
          imageUrl: { type: "string", format: "uri", nullable: true },
          documentUrl: { type: "string", format: "uri", nullable: true },
          filename: { type: "string", nullable: true },
        },
        additionalProperties: false,
      },
      metaCredentials: {
        type: "object",
        required: ["accessToken", "phoneNumberId"],
        properties: {
          accessToken: { type: "string" },
          phoneNumberId: { type: "string" },
        },
        additionalProperties: false,
      },
      companyId: { type: "string" },
      agentId: { type: "string", nullable: true },
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
        status: { type: "string", enum: ["sent", "scheduled"] },
        scheduleAt: { type: "string", format: "date-time", nullable: true },
        result: { type: "object", nullable: true },
      },
      required: ["status"],
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
      required: ["error"],
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
