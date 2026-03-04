import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/src/auth";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/studio");
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>ENTER</h1>
      <h1>STUDIO</h1>

      <pre style={{ marginTop: 16 }}>
        {JSON.stringify(session, null, 2)}
      </pre>
    </div>
  );
}