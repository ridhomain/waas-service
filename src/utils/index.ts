import { randomUUID } from 'crypto';
import { AnyMessageContent } from 'baileys';

export const nanoid = (n = 10) => {
  return randomUUID().replace(/-/g, '').substring(0, n);
};

export const normalizePhone = (phone: string) => {
  // replace 0 with 62
  const aPhone = phone.replace(/^0/g, '62');
  // clean up non numeric
  return aPhone.replace(/[^\d]/g, '');
};

export const normalizeLines = (aLines: string) => {
  if (!aLines) {
    return '';
  }

  return aLines.replace(/[ \t]/g, '');
};

export function isTextMessage(msg: AnyMessageContent): msg is { text: string } {
  return typeof (msg as any).text === 'string';
};

export function isImageMessage(msg: AnyMessageContent): msg is { image: any } {
  return 'image' in msg;
};

export function isDocumentMessage(msg: AnyMessageContent): msg is {
  document: any;
  mimetype: string;
  fileName: string;
  caption: string;
} {
  return 'document' in msg && 'mimetype' in msg && 'fileName' in msg && 'caption' in msg;
};

export function validateMessageType(type: string, message: any): string | null {
  if (type === 'text' && !isTextMessage(message)) return 'Invalid text message';
  if (type === 'image' && !isImageMessage(message)) return 'Invalid image message';
  if (type === 'document' && !isDocumentMessage(message)) return 'Invalid document message';
  return null;
};
