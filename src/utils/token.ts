import crypto from 'crypto';

const ALGORITHM_NAME = 'aes-128-gcm';
const ALGORITHM_NONCE_SIZE = 12;
const ALGORITHM_TAG_SIZE = 16;

export const decryptText = (ciphertextAndNonce: Buffer<ArrayBuffer>, KEY: Buffer<ArrayBuffer>) => {
  const nonce = ciphertextAndNonce.subarray(0, ALGORITHM_NONCE_SIZE);
  const ciphertext = ciphertextAndNonce.subarray(
    ALGORITHM_NONCE_SIZE,
    ciphertextAndNonce.length - ALGORITHM_TAG_SIZE
  );
  const tag = ciphertextAndNonce.subarray(ciphertext.length + ALGORITHM_NONCE_SIZE);
  const cipher = crypto.createDecipheriv(ALGORITHM_NAME, KEY, nonce);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(ciphertext), cipher.final()]);
};

export const verifyToken = (
  token: string,
  KEY: Buffer<ArrayBuffer>
): { ok: boolean; company?: string; message: string } => {
  const encryptedText = Buffer.from(token, 'hex');
  let company: string = '';
  try {
    company = decryptText(encryptedText, KEY).toString('utf-8');

    if (!company) {
      return { ok: false, company, message: 'Authentication failed' };
    }

    return { ok: true, company, message: 'Authentication succeed' };
  } catch (err) {
    return { ok: false, company, message: 'Authentication failed' };
  }
};
