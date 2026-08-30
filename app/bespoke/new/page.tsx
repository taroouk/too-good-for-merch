"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { actionCreateBespokeRequest } from "src/actions/bespoke-actions";

type BuildInfo = {
  build: {
    id: string;
    name: string | null;
    draft: {
      product: string | null;
      color: string | null;
      fabric: string | null;
      quantity: number;
      customNotes: string | null;
    };
  };
  placements: string[];
  artworkUrl: string | null;
};

function label(value: string | null): string {
  if (!value) return "—";
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function BespokeNewPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f5f4f0]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-black border-t-transparent" />
        </main>
      }
    >
      <BespokeNewContent />
    </Suspense>
  );
}

function BespokeNewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const buildId = searchParams.get("buildId");
  const { data: session, status } = useSession();

  const [info, setInfo] = useState<BuildInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginHref = `/login?callbackUrl=${encodeURIComponent(
    `/bespoke/new${buildId ? `?buildId=${buildId}` : ""}`,
  )}`;

  useEffect(() => {
    if (session?.user?.email && !email) setEmail(session.user.email);
  }, [email, session?.user?.email]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!buildId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/build/${encodeURIComponent(buildId)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Could not load this build.");
        if (!cancelled) setInfo(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this request.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [buildId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!buildId) return;
    if (status !== "authenticated") {
      window.location.assign(loginHref);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await actionCreateBespokeRequest({
        buildId,
        customer: { name, email, phone },
        placements: info?.placements,
      });
      if (result.ok) {
        router.replace(`/bespoke/${result.id}/submitted`);
        return;
      }
      setError(result.error);
      setSubmitting(false);
    } catch {
      setError("Something went wrong submitting your request. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f4f0]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-black border-t-transparent" />
      </main>
    );
  }

  if (!buildId || !info) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f4f0] px-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">Request unavailable</h1>
          <p className="mt-2 text-sm text-black/55">{error ?? "No build was selected."}</p>
          <a href="/studio" className="mt-6 inline-flex rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
            Back to studio
          </a>
        </section>
      </main>
    );
  }

  const draft = info.build.draft;

  return (
    <main className="min-h-screen bg-[#f5f4f0] px-4 py-10 text-black">
      <div className="mx-auto grid max-w-6xl gap-7 lg:grid-cols-[1fr_380px]">
        <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/35">Bespoke request</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Request a tailored quote</h1>
          <p className="mt-2 text-sm text-black/50">
            No payment is taken now. Send us your details and our team will review the design and
            get back to you with a bespoke quote.
          </p>

          {status === "unauthenticated" ? (
            <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              Please sign in so we can link this request to your account.
              <Link href={loginHref} className="ml-2 font-semibold underline">
                Sign in
              </Link>
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-7 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Full name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="mt-2 h-12 w-full rounded-xl border border-black/10 px-4 outline-none focus:border-black"
                />
              </label>
              <label className="block text-sm font-medium">
                Phone
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  autoComplete="tel"
                  placeholder="+20..."
                  className="mt-2 h-12 w-full rounded-xl border border-black/10 px-4 outline-none focus:border-black"
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                type="email"
                autoComplete="email"
                className="mt-2 h-12 w-full rounded-xl border border-black/10 px-4 outline-none focus:border-black"
              />
            </label>

            {error ? <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

            <button
              type="submit"
              disabled={submitting || status === "loading"}
              className="h-12 w-full rounded-xl bg-black text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Submitting request..." : "Submit bespoke request"}
            </button>
            <p className="text-center text-xs text-black/40">
              You will not be charged. This creates a request only.
            </p>
          </form>
        </section>

        <aside className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/35">Your design</p>
          <h2 className="mt-2 text-xl font-semibold">{info.build.name ?? "Studio build"}</h2>

          {info.artworkUrl ? (
            <div className="mt-4 flex h-48 items-center justify-center overflow-hidden rounded-xl bg-[#efece6]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={info.artworkUrl} alt="Saved artwork" className="h-full w-full object-contain" />
            </div>
          ) : null}

          <div className="mt-5 space-y-3 text-sm">
            <Row k="Product" v={label(draft.product)} />
            <Row k="Colour" v={label(draft.color)} />
            <Row k="Fabric" v={label(draft.fabric)} />
            <Row k="Quantity" v={String(draft.quantity)} />
            <Row k="Placements" v={info.placements.length ? info.placements.map(label).join(", ") : "—"} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-black/45">{k}</span>
      <strong className="text-right">{v}</strong>
    </div>
  );
}
