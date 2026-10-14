import { Prisma } from "@prisma/client";
import { prisma } from "src/lib/prisma";

export const CHECKOUT_FAILED_ACTION = "CHECKOUT_FAILED";

// A checkout that fails BEFORE an order row exists leaves no trace at all,
// which is exactly what makes "my order never arrived" impossible to
// diagnose. This records every failed create-intent (the customer's id, the
// build, the error code and the real cause) in the admin audit log, where it
// surfaces on System health. Never throws.
export async function recordCheckoutFailure(input: {
  userId: string | null;
  buildId: string | null;
  orderId?: string | null;
  code: string;
  status: number;
  cause: unknown;
}): Promise<void> {
  try {
    const message = input.cause instanceof Error ? input.cause.message : String(input.cause ?? "");
    await prisma.adminAuditLog.create({
      data: {
        orderId: input.orderId ?? null,
        action: CHECKOUT_FAILED_ACTION,
        newValue: input.code,
        metadata: {
          userId: input.userId,
          buildId: input.buildId,
          status: input.status,
          message: message.slice(0, 600),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error("[checkout] could not record the failure", error);
  }
}
