import "@/app/auth.css";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/src/auth";
import SignOutButton from "./SignOutButton";

export default async function StudioPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/studio");
  }

  const email = session.user.email ?? "unknown";
  const role = (session.user as any).role ?? "USER";

  return (
    <main className="studioWrap">
      <header className="studioHeader">
        <div>
          <h1 className="studioTitle">Studio</h1>
          <p className="studioSub">
            Signed in as <b>{email}</b>
          </p>
        </div>

        <SignOutButton />
      </header>

      <section className="studioCard">
        <span className="badge">ROLE · {role}</span>

        <pre className="mono">
{JSON.stringify(
  { user: { email, role } },
  null,
  2
)}
        </pre>
      </section>
    </main>
  );
}