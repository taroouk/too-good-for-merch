import { PaymentAttemptStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "src/auth";
import { apiError, readJsonObject } from "src/lib/api/responses";
import { prisma } from "src/lib/prisma";
import {
  CheckoutError,
  createCheckoutOrder,
  shippingAddressColumns,
  validateCheckoutContact,
} from "src/lib/orders/checkout";
import { createCartCheckoutOrder } from "src/lib/orders/cart-checkout";
import { competingPaymentMessage, orderPayability, termsConsentStatus } from "src/lib/orders/payable";
import { findCompetingLivePayment, findSupersedingPaidOrder, orderBuildIds } from "src/lib/orders/superseded";
import { assertApprovedTotal, orderFailureUpdateFor } from "src/lib/orders/errors";
import { createPaymobPayment, PaymobError, paymobFlow, walletPaymentsEnabled } from "src/lib/payments/paymob";
import { currentTermsVersion } from "src/lib/legal";
import { recordCheckoutFailure } from "src/lib/orders/checkout-failure";
import { rateLimitHeaders } from "src/lib/rate-limit";
import { rateLimit } from "src/lib/rate-limit-db";
import { resolveCurrentCurrency } from "src/pricing/engine";

export const runtime = "nodejs";

// P1-12/P2-3: without an explicit maxDuration this route silently inherits
// whatever Vercel's un-set default happens to be for the account it's
// deployed to, which can be lower than the work this handler actually does.
// 60s is the highest value guaranteed to be valid on every Vercel plan tier
// (see the identical rationale in app/api/mockups/nanobanana/route.ts).
// Worst case this handler can spend, budgeted to stay under that ceiling:
// - up to 3 sequential Paymob calls for CARD (4 for WALLET) share ONE 25s
//   deadline (PAYMOB_CALL_BUDGET_MS in src/lib/payments/paymob.ts) rather
//   than each getting its own independent timeout, so adding a step never
//   grows the total budget;
// - the payment-attempt-decision transaction below and, for a fresh order,
//   the nested createCheckoutOrder transaction (src/lib/orders/checkout.ts)
//   are each capped at 8s maxWait + 8s timeout (~16s worst case each, ~32s
//   for both).
// 25s + 32s = 57s, under the 60s ceiling with a few seconds of margin for
// request parsing/serialization. If Paymob's real-world latency ever makes
// 25s too tight, raise PAYMOB_CALL_BUDGET_MS and re-check this sum rather
// than raising maxDuration blind.
export const maxDuration = 60;

function paymobStageInfo(details: unknown): { stage?: string; status?: number } {
  if (details && typeof details === "object") {
    const record = details as Record<string, unknown>;
    return {
      stage: typeof record.stage === "string" ? record.stage : undefined,
      status: typeof record.status === "number" ? record.status : undefined,
    };
  }
  return {};
}

function errorResponse(error: unknown, orderId?: string) {
  if (error instanceof CheckoutError) {
    const code = error.code ?? "CHECKOUT_VALIDATION_FAILED";
    return NextResponse.json(
      { error: error.message, code, orderId, ...(error.details ?? {}) },
      { status: error.status, headers: { "x-checkout-code": code } },
    );
  }
  if (error instanceof PaymobError) {
    // The full redacted provider response was already logged by paymobFetch
    // (src/lib/payments/paymob.ts) at the point of failure; this just
    // correlates that log line with the order for diagnostics.
    console.error("[Paymob] create-intent failed", { orderId, ...paymobStageInfo(error.details) });
    return NextResponse.json(
      {
        error: "We couldn't start your payment. Please check your information and try again.",
        code: "PAYMENT_INITIALIZATION_FAILED",
        orderId,
      },
      { status: 502, headers: { "x-checkout-code": "PAYMENT_INITIALIZATION_FAILED" } },
    );
  }
  console.error("CHECKOUT_CREATE_ERROR", error instanceof Error ? error.message : error);
  return NextResponse.json(
    { error: "Unable to start payment. Please try again.", code: "INTERNAL_ERROR", orderId },
    { status: 500, headers: { "x-checkout-code": "INTERNAL_ERROR" } },
  );
}

function customerInput(value: unknown) {
  const customer = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    name: String(customer.name ?? ""),
    email: String(customer.email ?? ""),
    phone: String(customer.phone ?? ""),
  };
}

function termsRequiredResponse(termsChanged: boolean) {
  return NextResponse.json(
    {
      error: termsChanged
        ? "Our Terms & Conditions or Refund Policy changed since you agreed. Please review and accept them to continue."
        : "Please accept the Terms & Conditions and Refund Policy to continue.",
      code: "TERMS_NOT_ACCEPTED",
      termsChanged,
    },
    { status: 400, headers: { "x-checkout-code": "TERMS_NOT_ACCEPTED" } },
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("Sign in to continue.", 401);
  }

  const limit = await rateLimit(req, `checkout:${session.user.id}`, 12, 10 * 60 * 1000);
  if (!limit.ok) {
    return apiError(
      "Too many checkout attempts. Please try again later.",
      429,
      rateLimitHeaders(limit),
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { blockedAt: true },
  });
  if (!user || user.blockedAt) {
    return apiError("This account cannot place orders.", 403);
  }

  const body = await readJsonObject(req);
  if (!body) {
    return apiError("Invalid checkout request.", 400);
  }

  // Consent is mandatory and enforced here, not just by the checkout checkbox, so a direct API call can't skip it.
  // A NEW order always needs it in the request. A retry of an existing order (orderId) may rely on the consent
  // already stored on that order, but only while the Terms / Refund revision is still the one that was agreed to
  // (checked below, once the order is loaded). Having an orderId is never consent by itself.
  const retryingExistingOrder = typeof body.orderId === "string" && Boolean(body.orderId);
  if (body.acceptTerms !== true && !retryingExistingOrder) {
    return termsRequiredResponse(false);
  }

  if (body.method !== PaymentMethod.CARD && body.method !== PaymentMethod.WALLET) {
    return apiError("Invalid payment method.", 400);
  }

  const method = body.method;
  if (method === PaymentMethod.WALLET && !walletPaymentsEnabled()) {
    return apiError("Wallet payments are not enabled.", 400);
  }

  let order: Awaited<ReturnType<typeof createCheckoutOrder>> | null = null;
  let attemptId: string | null = null;

  try {
    if (typeof body.orderId === "string" && body.orderId) {
      order = await prisma.order.findFirst({
        where: { id: body.orderId, userId: session.user.id },
        include: { items: true },
      });
      if (!order) throw new CheckoutError("Order not found.", 404);
      // Only a payable order can be paid again: never one that is paid, refunded, cancelled or already in production.
      const verdict = orderPayability(order);
      if (!verdict.ok) throw new CheckoutError(verdict.message, 409, verdict.code);
      // An order created before a store currency correction (StoreSetting /
      // STORE_CURRENCY) is permanently stuck with its original currency -
      // Paymob will reject the same wrong currency forever on retry. Refuse
      // the stale retry with a clear, actionable message instead of
      // repeating a doomed provider call (and instead of silently rewriting
      // a real order's currency, which is a pricing decision, not this
      // route's to make unilaterally).
      const currentCurrency = await resolveCurrentCurrency();
      if (order.currency !== currentCurrency) {
        throw new CheckoutError(
          "This order's payment configuration is outdated. Please return to the Studio and start a new checkout.",
          409,
        );
      }
      // If the caller states the total it approved, it must be this order's total.
      if (body.expectedTotalCents !== undefined) assertApprovedTotal(body.expectedTotalCents, order.totalCents, order.currency);
      // Consent: either given now, or already stored on this order for the SAME revision of the Terms / Refund pages.
      if (body.acceptTerms !== true) {
        const consent = termsConsentStatus(order, await currentTermsVersion());
        if (!consent.ok) return termsRequiredResponse(consent.termsChanged);
      }
      // The checkout page lets the customer edit their details and resubmit against the same order (e.g. after
      // correcting the delivery address), so the latest contact + address are persisted on retry too. A retry that
      // sends none (the "Complete payment" button on the order page) keeps the details stored on the order.
      if (body.customer !== undefined || body.shippingAddress !== undefined) {
        const { customer, address } = validateCheckoutContact(customerInput(body.customer), body.shippingAddress);
        order = await prisma.order.update({
          where: { id: order.id },
          data: {
            customerName: customer.name,
            customerEmail: customer.email,
            customerPhone: customer.phone,
            ...shippingAddressColumns(address),
          },
          include: { items: true },
        });
      }
    } else if (body.cart === true) {
      // One checkout for the whole bag: the server reads the bag itself, nothing about items comes from the client.
      order = await createCartCheckoutOrder(session.user.id, {
        customer: customerInput(body.customer),
        shippingAddress: body.shippingAddress,
        expectedTotalCents: body.expectedTotalCents,
      });
    } else {
      order = await createCheckoutOrder(session.user.id, {
        buildId: typeof body.buildId === "string" ? body.buildId : "",
        customer: customerInput(body.customer),
        shippingAddress: body.shippingAddress,
        expectedTotalCents: body.expectedTotalCents,
        size: body.size,
      });
    }

    // Record the consent against the order, with the revision of the Terms / Refund pages that was live -- the
    // evidence that this customer agreed to exactly this text before paying. Only when it was given in THIS request:
    // a retry that relies on the stored consent must not overwrite it.
    if (body.acceptTerms === true) {
      await prisma.order.update({
        where: { id: order.id },
        data: { termsAcceptedAt: new Date(), termsVersion: await currentTermsVersion() },
      });
    }

    // The check-and-create step below must be serialized per order: without
    // it, two near-simultaneous requests (double click, two tabs) can both
    // pass the "no reusable attempt yet" check before either has committed
    // its new PaymentAttempt row, producing two live Paymob payment links
    // for the same order. `FOR UPDATE` blocks a concurrent transaction on
    // the same order row until this one commits; it's safe under this
    // project's PgBouncer (pgbouncer=true) pooled connection because the
    // lock and every statement that depends on it live inside one
    // transaction, never spanning separate pooled connections.
    const decision = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order!.id} FOR UPDATE`;
      // One design, one payment at a time: the designs of this order are locked too (fixed order, so two requests can
      // never wait on each other), which makes two orders for the same design take this decision one after the other.
      for (const buildId of orderBuildIds(order!).sort()) {
        await tx.$queryRaw`SELECT id FROM "Build" WHERE id = ${buildId} FOR UPDATE`;
      }
      // Another order for the same design was paid after this one was created: never start a second payment.
      const winner = await findSupersedingPaidOrder(tx, order!);
      if (winner) return { kind: "superseded" as const, orderNumber: winner.orderNumber };

      const recentAttempt = await tx.paymentAttempt.findFirst({
        where: {
          orderId: order!.id,
          method,
          status: PaymentAttemptStatus.PENDING,
          paymentUrl: { not: null },
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
      });
      if (recentAttempt?.paymentUrl) {
        return { kind: "reuse" as const, paymentUrl: recentAttempt.paymentUrl };
      }

      // A CREATED attempt with no paymentUrl yet means a request for this
      // exact order+method is still mid-flight talking to Paymob (that call
      // can take several seconds - see createPaymobPayment). Don't kick off
      // a second, redundant Paymob call and a second real payment link;
      // ask the caller to wait for the in-flight one instead.
      const inFlight = await tx.paymentAttempt.findFirst({
        where: {
          orderId: order!.id,
          method,
          status: PaymentAttemptStatus.CREATED,
          createdAt: { gte: new Date(Date.now() - 25 * 1000) },
        },
      });
      if (inFlight) {
        return { kind: "in-flight" as const };
      }

      // Another order for the same design already has a payment link that can still be paid: no second link.
      const competing = await findCompetingLivePayment(tx, order!);
      if (competing) return { kind: "competing" as const, orderId: competing.order.id, orderNumber: competing.order.orderNumber, status: competing.status, startedAt: competing.startedAt };

      const created = await tx.paymentAttempt.create({
        data: { orderId: order!.id, method, amountCents: order!.totalCents, currency: order!.currency },
      });
      return { kind: "created" as const, attemptId: created.id };
    }, {
      // Equal maxWait/timeout (vs Prisma's 2s/5s defaults) so a second
      // concurrent request waiting on the lock can wait out the full
      // duration the first transaction is itself allowed to run. Kept short
      // since this sits inside the route's overall serverless duration
      // budget -- see the maxDuration comment above.
      maxWait: 8_000,
      timeout: 8_000,
    });

    if (decision.kind === "superseded") {
      throw new CheckoutError(
        `Another order for this design (${decision.orderNumber}) was paid after you started this one, so this order can't be paid. To order another copy, start a new checkout.`,
        409,
        "ORDER_SUPERSEDED",
      );
    }
    if (decision.kind === "competing") {
      // Another payment for this design is open: tell the customer plainly what to do. Only their OWN other order is named.
      const info = competingPaymentMessage({ status: decision.status, startedAt: decision.startedAt, orderNumber: decision.orderNumber }, Date.now());
      throw new CheckoutError(info.message, 409, "ORDER_COMPETING_PAYMENT", {
        existingOrderId: decision.orderId,
        existingOrderNumber: decision.orderNumber,
        linkExpiresAt: info.linkExpiresAt,
        minutesLeft: info.minutesLeft,
      });
    }
    if (decision.kind === "reuse") {
      return NextResponse.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentUrl: decision.paymentUrl,
        redirect: paymobFlow() === "intention",
      });
    }
    if (decision.kind === "in-flight") {
      // Returned directly (not thrown) so this never reaches the catch
      // block below: a sibling request is still talking to Paymob right
      // now and may succeed a moment later, so this request must not mark
      // the order FAILED - that's not what happened here, another request
      // just got there first.
      return NextResponse.json(
        {
          error: "A payment is already being started for this order. Please wait a moment and try again.",
          code: "PAYMENT_ALREADY_IN_PROGRESS",
          orderId: order.id,
        },
        { status: 409 },
      );
    }
    attemptId = decision.attemptId;

    const payment = await createPaymobPayment(order, method);
    await prisma.$transaction([
      prisma.paymentAttempt.update({
        where: { id: attemptId },
        data: {
          status: PaymentAttemptStatus.PENDING,
          externalId: payment.paymobOrderId,
          paymentUrl: payment.paymentUrl,
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: method,
          paymobOrderId: payment.paymobOrderId,
          paymentUrl: payment.paymentUrl,
          paymentFailureReason: null,
        },
      }),
    ]);

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentUrl: payment.paymentUrl,
      // Unified Checkout is a full Paymob page: the customer is sent there (the legacy Accept form can be embedded).
      redirect: paymobFlow() === "intention",
      walletEnabled: walletPaymentsEnabled(),
    });
  } catch (error) {
    if (attemptId) {
      await prisma.paymentAttempt
        .update({
          where: { id: attemptId },
          data: {
            status: PaymentAttemptStatus.FAILED,
            failureReason: error instanceof Error ? error.message.slice(0, 500) : "Unknown payment error",
          },
        })
        .catch(() => undefined);
    }
    // P0-5: a CheckoutError (stale order currency, order not found, etc.)
    // means this request was rejected before any real payment was
    // attempted -- it must never flip a healthy PENDING order to FAILED.
    // See orderFailureUpdateFor's own comment for the full rationale.
    const failureUpdate = orderFailureUpdateFor(order, error);
    if (order && failureUpdate) {
      await prisma.order
        .update({ where: { id: order.id }, data: failureUpdate })
        .catch(() => undefined);
    }
    const failure = errorResponse(error, order?.id);
    await recordCheckoutFailure({
      userId: session.user.id,
      buildId: typeof body.buildId === "string" ? body.buildId : null,
      orderId: order?.id ?? null,
      code: failure.headers.get("x-checkout-code") ?? "UNKNOWN",
      status: failure.status,
      cause: error,
    });
    return failure;
  }
}
