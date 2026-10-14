// Built-in DRAFT legal pages, shown until an admin saves their own copy at
// /admin/legal. They are a reasonable starting point for a made-to-order
// print store -- NOT legal advice. Anything in [SQUARE BRACKETS] is a
// business decision the client must fill in, and the admin editor warns
// while any remain. Have counsel review before launch.
import type { LegalSlug } from "src/lib/legal-format";

export const LEGAL_DEFAULTS: Record<LegalSlug, { title: string; body: string }> = {
  terms: {
    title: "Terms & Conditions",
    body: `## 1. Who we are
Too Good For Merch ("we", "us") runs a made-to-order apparel studio at [WEBSITE ADDRESS]. You can reach us at hello@toogoodformerch.com. By placing an order or creating an account you agree to these terms.

## 2. Your account
You must give accurate details and keep your password private. You are responsible for activity on your account. We may suspend accounts that are used for abuse or fraud.

## 3. Custom products and your artwork
Every item is printed to order from the design you create or upload in our Studio.
- You confirm that you own the artwork you upload or generate, or have the right to use it, and that it does not infringe anyone's copyright, trademark or other rights.
- You must not submit artwork that is unlawful, hateful, sexually explicit, or that infringes third-party rights. We may refuse or cancel any order with such artwork and will refund it in full.
- Artwork generated with our AI tools is created from the prompt you provide. You are responsible for checking it before you order.
- You keep the rights in your artwork. You give us a limited licence to reproduce it only to produce and deliver your order, and to show it in your account.

## 4. Prices and payment
Prices are shown in USD and charged in EGP at the exchange rate shown at checkout. Payment is processed securely by Paymob; we never see or store your card details. Your order is confirmed only once payment succeeds, and we email you a confirmation.

## 5. Production and delivery
Orders are produced after payment. Estimated production time is [PRODUCTION TIME, e.g. 5–7 BUSINESS DAYS] and delivery takes [DELIVERY TIME] depending on your address. These are estimates, not guarantees. We will email you tracking details when your order ships. Delivery is currently available to [DELIVERY COUNTRIES].

## 6. Bespoke and bulk orders
Custom (bespoke) requests and orders above 500 units are quoted individually. A quote is valid for [QUOTE VALIDITY, e.g. 14 DAYS] and an order is only binding once you accept the quote and pay.

## 7. Cancellations, returns and refunds
See our Refund & Returns Policy, which forms part of these terms.

## 8. Colours and mockups
Mockups and previews are for guidance. Printed colours can differ slightly from your screen because of fabric, lighting and printing.

## 9. Our liability
Nothing in these terms limits liability that cannot be limited by law. Otherwise, our liability for any order is limited to the amount you paid for it. We are not liable for delays caused by events outside our control.

## 10. Changes to these terms
We may update these terms. The version in force when you place an order applies to that order.

## 11. Governing law
These terms are governed by the laws of [GOVERNING LAW, e.g. THE ARAB REPUBLIC OF EGYPT], and its courts have jurisdiction, subject to any mandatory consumer rights you have where you live.

## 12. Contact
Questions about these terms: hello@toogoodformerch.com.`,
  },

  privacy: {
    title: "Privacy Policy",
    body: `## 1. Overview
This policy explains what personal data Too Good For Merch collects, why, and your choices. Our contact for privacy questions is hello@toogoodformerch.com.

## 2. What we collect
- **Account data:** your email address and a securely hashed password.
- **Order data:** your name, phone number, delivery address, the items you order, and order and payment status.
- **Your content:** artwork you upload or generate in the Studio, the text prompts you give our AI tools, and your saved projects and wishlist.
- **Payment data:** card payments are handled by Paymob. We receive only the transaction result and reference, never your full card number.
- **Technical data:** a session cookie that keeps you signed in, and basic server logs (IP address, browser type, pages requested) used for security and to fix problems.
- **Messages:** what you send us through the contact and bespoke request forms, WhatsApp or email.

## 3. How we use it
- To create your account, take payment, produce and deliver your order, and email you about it (confirmation, shipping updates, password resets).
- To generate and preview artwork and mockups you request.
- To prevent fraud and abuse, keep records we are legally required to keep, and improve the service.
We do not sell your personal data.

## 4. Who we share it with
Only service providers that help us run the store, and only what they need:
- **Paymob** for payment processing.
- **Our hosting and database providers** to run the website.
- **An AI image provider** that receives your prompt and artwork inputs to generate previews and artwork.
- **Our email provider** to send you transactional emails.
- **Couriers** receive your name, phone number and address to deliver your order.
We may also disclose data if the law requires it.

## 5. How long we keep it
We keep account and order records for as long as your account is open and for [RETENTION PERIOD, e.g. 5 YEARS] afterwards where needed for accounting and legal reasons. You can ask us to delete your account and saved artwork; we will do so except for records we must keep.

## 6. Your rights
You can ask to access, correct, or delete your personal data, or to object to how we use it, by emailing hello@toogoodformerch.com. We will reply within [RESPONSE TIME, e.g. 30 DAYS].

## 7. Cookies
We use only the cookies needed to keep you signed in and to run the store securely. We do not use advertising cookies.

## 8. Security
Passwords are hashed, connections are encrypted, and access to order data is restricted to authorised staff. No system is perfectly secure, so please use a strong, unique password.

## 9. Children
Our store is not directed at children under [MINIMUM AGE, e.g. 16] and we do not knowingly collect their data.

## 10. Changes
We will post any changes here and update the date of the last revision.`,
  },

  refunds: {
    title: "Refund & Returns Policy",
    body: `## Made-to-order items
Because every item is printed specially for you, we cannot accept returns or exchanges for change of mind, wrong size ordered, or colour preferences.

## When we will fix it or refund you
Contact us at hello@toogoodformerch.com within [CLAIM WINDOW, e.g. 7] days of delivery, with your order number and clear photos, if your order:
- arrives damaged or defective,
- has a print that is significantly different from the approved preview (wrong placement, missing or faulty print), or
- is the wrong item or quantity.
We will, at our choice and with your agreement, reprint and resend the item at no cost, or refund the affected items.

## Cancelling an order
You can cancel for a full refund before production starts. Message us as soon as possible with your order number. Once production has started we cannot cancel, because the item is already being made.

## Our responsibility on artwork
We print the artwork you approve. We cannot refund orders because the artwork itself (for example an AI-generated image) was not what you hoped for, so please review your preview carefully before paying.

## How refunds are paid
Approved refunds go back to the original payment method through Paymob. Banks typically take [REFUND PROCESSING TIME, e.g. 7–14 BUSINESS DAYS] to show the money.

## Bespoke and bulk orders
Terms for quoted orders are agreed in the quote. Deposits and cancellation for these orders follow what is written in your accepted quote.

## Contact
hello@toogoodformerch.com`,
  },
};
