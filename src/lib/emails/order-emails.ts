type OrderEmailItem = {
    name: string;
    quantity: number;
    priceText?: string;
    details?: string;
  };
  
  type StandardOrderEmailInput = {
    firstName: string;
    orderNumber: string;
    placedOn: string;
    items: OrderEmailItem[];
    subtotalText: string;
    shippingText: string;
    totalText: string;
    shippingTo: {
      fullName: string;
      addressLine1: string;
      city: string;
      country: string;
    };
  };
  
  type CustomOrderEmailInput = {
    firstName: string;
    requestNumber: string;
    submittedOn: string;
    items: OrderEmailItem[];
  };
  
  export function buildStandardOrderEmail(
    input: StandardOrderEmailInput,
  ): string {
    const itemsText = input.items
      .map((item) => {
        const details = item.details ? ` — ${item.details}` : "";
        const price = item.priceText ? `\nPrice: ${item.priceText}` : "";
  
        return `1× ${item.name}${details}
  Qty: ${item.quantity}${price}`;
      })
      .join("\n\n");
  
    return `Hi ${input.firstName},
  
  Your order is confirmed. Here's what we have on file.
  
  ---
  
  Order ${input.orderNumber}
  Placed on ${input.placedOn}
  
  ITEMS
  
  ${itemsText}
  
  SUBTOTAL: ${input.subtotalText}
  SHIPPING: ${input.shippingText}
  TOTAL: ${input.totalText}
  
  SHIPPING TO:
  ${input.shippingTo.fullName}
  ${input.shippingTo.addressLine1}
  ${input.shippingTo.city}
  ${input.shippingTo.country}
  
  ---
  
  ESTIMATED LEAD TIME: 3–5 business days
  
  Please note this is an estimate. Because every order is custom made, we'll be in touch to confirm your exact production timeline and walk you through any next steps - including samples if you're placing a large order.
  
  Questions in the meantime? Reply here or reach us at hello@toogoodformerch.com.
  
  Thanks for your order.
  
  TGFM Team
  toogoodformerch.com`;
  }
  
  export function buildCustomOrderEmail(input: CustomOrderEmailInput): string {
    const itemsText = input.items
      .map((item) => {
        const details = item.details ? ` ${item.details}` : "";
  
        return `1× ${item.name}${details}
  Customisation: Custom spec requested`;
      })
      .join("\n\n");
  
    return `Hi ${input.firstName},
  
  Thanks for reaching out. We've received your custom order request and we're on it.
  
  ---
  
  Request ${input.requestNumber}
  Submitted on ${input.submittedOn}
  
  ITEMS
  
  ${itemsText}
  
  ---
  
  Because your order includes custom specifications, we'll be in touch directly to go over the details, confirm pricing, and agree on a timeline that works for you.
  
  You don't need to do anything right now.
  
  If you'd like to get ahead of it, feel free to reply to this email or contact us at hello@toogoodformerch.com.
  
  Speak soon.
  
  TGFM Team
  toogoodformerch.com`;
  }