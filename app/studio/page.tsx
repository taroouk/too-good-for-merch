import { getServerSession } from "next-auth";
import { authOptions } from "@/src/auth";
import { redirect } from "next/navigation";

export default async function StudioPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/studio");
  }

  const role = (session.user as any).role;
  if (role !== "ADMIN") {
    return <div style={{ padding: 24 }}>Forbidden</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>ENTER STUDIO</h1>
      <pre>{JSON.stringify(session, null, 2)}</pre>
    </div>
  );
}