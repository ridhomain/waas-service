export const baileysMessageSchema = {
  type: 'object',
  anyOf: [
    {
      required: ['text'],
      properties: {
        text: { type: 'string', minLength: 1 }
      },
      additionalProperties: false
    },
    {
      required: ['image'],
      properties: {
        image: { type: 'object' },
        caption: { type: 'string', nullable: true }
      },
      additionalProperties: false
    },
    {
      required: ['document', 'fileName', 'mimetype'],
      properties: {
        document: { type: 'object' },
        fileName: { type: 'string', minLength: 1 },
        mimetype: { type: 'string', minLength: 1 },
        caption: { type: 'string', nullable: true }
      },
      additionalProperties: false
    }
  ]
};