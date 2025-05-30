export const baileysMessageSchema = {
  type: "object",
  anyOf: [
    {
      required: ["text"],
      properties: {
        text: { type: "string" }
      },
      additionalProperties: false
    },
    {
      required: ["image"],
      properties: {
        image: { type: "object" },
        caption: { type: "string" }
      },
      additionalProperties: false
    },
    {
      required: ["document", "fileName", "mimetype"],
      properties: {
        document: { type: "object" },
        fileName: { type: "string" },
        mimetype: { type: "string" },
        caption: { type: "string" }
      },
      additionalProperties: false
    }
  ]
};