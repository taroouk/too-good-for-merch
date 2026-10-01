// Pure, dependency-free contact-details validation shared by the paid
// checkout (src/lib/orders/checkout.ts) and the no-payment Bespoke request
// intake (src/actions/bespoke-actions.ts). Extracted verbatim from
// checkout.ts so both paths enforce the identical rules and the logic is
// unit-testable without Prisma/Next -- see
// src/lib/orders/__tests__/customer.test.ts.

import { findCountry } from "../geo/countries";

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

// Delivery address collected on the checkout page. Stored as explicit
// Order.shipping* columns (see prisma/schema.prisma) so fulfilment can
// read it without parsing JSON. `country` is an ISO 3166-1 alpha-2 code
// from src/lib/geo/countries.ts.
export type ShippingAddressInput = {
  country: string;
  city: string;
  region: string;
  line1: string;
  line2: string;
  postalCode: string;
};

export function validateShippingAddress(value: unknown): ShippingAddressInput {
  const address = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const country = findCountry(address.country);
  const line1 = cleanText(address.line1, 200);
  const line2 = cleanText(address.line2, 200);
  const city = cleanText(address.city, 100);
  const region = cleanText(address.region, 100);
  const postalCode = cleanText(address.postalCode, 20);
  if (!country) throw new CustomerValidationError("Select a delivery country.");
  if (line1.length < 3) throw new CustomerValidationError("Enter your street address.");
  if (city.length < 2) throw new CustomerValidationError("Enter your city.");
  return { country: country.code, city, region, line1, line2, postalCode };
}
