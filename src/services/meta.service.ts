import axios from "axios";
import { MetaMessagePayload } from "../types/meta.types";

export async function sendToMetaAPI(payload: MetaMessagePayload) {
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

  // (Optional) Add other types here in future

  try {
    const response = await axios.post(url, baseBody, { headers });
    return response.data;
  } catch (error: any) {
    // Axios error handling
    const metaError = error.response?.data || error.message;
    throw new Error(`[Meta API Error] ${JSON.stringify(metaError)}`);
  }
}
