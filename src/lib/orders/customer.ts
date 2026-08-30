// Pure, dependency-free contact-details validation shared by the paid
// checkout (src/lib/orders/checkout.ts) and the no-payment Bespoke request
// intake (src/actions/bespoke-actions.ts). Extracted verbatim from
// checkout.ts so both paths enforce the identical rules and the logic is
// unit-testable without Prisma/Next -- see
// src/lib/orders/__tests__/customer.test.ts.

export class CustomerValidationError extends Error {
  // Mirrors CheckoutError's shape so the paymob create-intent route's
  // `error.status` handling keeps working when checkout.ts re-throws.
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "CustomerValidationError";
  }
}

export function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export type CustomerInput = { name: string; email: string; phone: string };

export function validateCustomer(customer: CustomerInput): CustomerInput {
  const name = cleanText(customer?.name, 120);
  const email = cleanText(customer?.email, 254).toLowerCase();
  const phone = cleanText(customer?.phone, 30).replace(/[()\s-]/g, "");
  if (name.length < 2) throw new CustomerValidationError("Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CustomerValidationError("Enter a valid email address.");
  }
  if (!/^\+?[0-9]{8,15}$/.test(phone)) {
    throw new CustomerValidationError("Enter a valid phone number including country code.");
  }
  return { name, email, phone };
}
