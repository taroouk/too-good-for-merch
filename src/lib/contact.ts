const DEFAULT_WHATSAPP_PHONE = "201118399923";
const DEFAULT_WHATSAPP_MESSAGE =
  "Hi TGFM, I’d love a quote!\nWhat info do you need from me?";
const DEFAULT_CONTACT_EMAIL = "hello@toogoodformerch.com";

export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL;

export const INSTAGRAM_URL =
  process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim() ||
  "https://www.instagram.com/toogoodformerch";

export const TIKTOK_URL =
  process.env.NEXT_PUBLIC_TIKTOK_URL?.trim() ||
  "https://www.tiktok.com/@toogoodformerch";

export const WHATSAPP_PHONE =
  process.env.NEXT_PUBLIC_WHATSAPP_PHONE?.replace(/\D/g, "") ||
  DEFAULT_WHATSAPP_PHONE;

export const WHATSAPP_MESSAGE =
  process.env.NEXT_PUBLIC_WHATSAPP_MESSAGE || DEFAULT_WHATSAPP_MESSAGE;

export const WHATSAPP_URL =
  `https://wa.me/${WHATSAPP_PHONE}?text=` + encodeURIComponent(WHATSAPP_MESSAGE);

export const EMAIL_URL = `mailto:${CONTACT_EMAIL}`;
