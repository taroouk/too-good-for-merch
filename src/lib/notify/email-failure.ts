import { Prisma } from "@prisma/client";
import { prisma } from "src/lib/prisma";

export const EMAIL_FAILED_ACTION = "EMAIL_FAILED";

// A customer email that couldn't be sent leaves no trace on its own (the user
// only sees "check your inbox"). This records it in the admin audit log, where
// System health surfaces it. The address is masked. Never throws.
export async function recordEmailFailure(input: { kind: string; to?: string | null; reason: string; orderId?: string | null }) {
  try {
    const masked = input.to ? input.to.replace(/^(.).*(@.*)$/, "$1***$2") : null;
    await prisma.adminAuditLog.create({
      data: {
        orderId: input.orderId ?? null,
        action: EMAIL_FAILED_ACTION,
        newValue: input.kind,
        metadata: { kind: input.kind, to: masked, reason: input.reason.slice(0, 400) } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error("[notify/email-failure] could not record", error);
  }
}
