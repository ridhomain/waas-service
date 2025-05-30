import { AnyMessageContent } from 'baileys';

export const isTextMessage = (msg: AnyMessageContent): msg is { text: string } => {
  return typeof (msg as any).text === 'string';
};

export const isImageMessage = (msg: AnyMessageContent): msg is { image: any; caption?: string } => {
  return 'image' in msg;
};

export const isDocumentMessage = (msg: AnyMessageContent): msg is {
  document: any;
  mimetype: string;
  fileName: string;
  caption?: string;
} => {
  return 'document' in msg && 'mimetype' in msg && 'fileName' in msg;
};

export const validateMessageType = (type: string, message: any): string | null => {
  switch (type) {
    case 'text':
      return isTextMessage(message) ? null : 'Invalid text message';
    case 'image':
      return isImageMessage(message) ? null : 'Invalid image message';
    case 'document':
      return isDocumentMessage(message) ? null : 'Invalid document message';
    default:
      return 'Invalid message type';
  }
};