"use client";

import Link from "next/link";

export default function WishlistError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f1ed] px-4 text-black">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">Couldn&apos;t load your wishlist</h1>
        <p className="mt-2 text-sm text-black/55">{error.message || "Please try again."}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white"
          >
            Try again
          </button>
          <Link href="/studio" className="rounded-xl border border-black px-5 py-3 text-sm font-semibold">
            Back to studio
          </Link>
        </div>
      </div>
    </main>
  );
}
