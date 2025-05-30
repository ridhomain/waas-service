// src/services/meta.service.ts (updated)
import axios from "axios";
import { MetaSendMessageInput } from "../schemas/zod-schemas";

export async function sendToMetaAPI(payload: MetaSendMessageInput) {
  const { type, to, message, metaCredentials } = payload;
  const { accessToken, phoneNumberId } = metaCredentials;

  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const baseBody: any = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type,
  };

  if (type === "text") {
    baseBody.text = {
      body: message.text!,
    };
  }

  if (type === "image") {
    baseBody.image = {
      link: message.imageUrl!,
    };
    if (message.text) {
      baseBody.image.caption = message.text;
    }
  }

  if (type === "document") {
    baseBody.document = {
      link: message.documentUrl!,
      filename: message.filename!,
    };
    if (message.text) {
      baseBody.document.caption = message.text;
    }
  }

  try {
    const response = await axios.post(url, baseBody, { headers });
    return response.data;
  } catch (error: any) {
    // Axios error handling
    const metaError = error.response?.data || error.message;
    throw new Error(`[Meta API Error] ${JSON.stringify(metaError)}`);
  }
}