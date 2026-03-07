// src/lib/whatsapp.ts
export const WHATSAPP_PHONE = "201118399923";
export const WHATSAPP_MESSAGE =
  "Hi TGFM, I’d love a quote!\nWhat info do you need from me?";

export const WHATSAPP_URL =
  `https://wa.me/${WHATSAPP_PHONE}?text=` + encodeURIComponent(WHATSAPP_MESSAGE);