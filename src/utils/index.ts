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