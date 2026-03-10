// file: src/studio/authz.ts
import { redirect } from "next/navigation";
import { auth } from "src/auth";

export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as any)?.id ?? null;
}

export async function requireUserId(callbackUrl: string = "/studio") {
  const userId = await getUserId();
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return userId;
}