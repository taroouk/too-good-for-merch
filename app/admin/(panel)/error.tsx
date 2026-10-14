"use client";

import Link from "next/link";
import Card from "src/components/admin/ui/Card";
import { buttonClass } from "src/components/admin/ui/Button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-xl">
        <Card title="Something went wrong" subtitle="The admin dashboard hit an unexpected error loading this page.">
          <p className="text-sm text-admin-muted">
            {error.message || "An unexpected error occurred."}
            {error.digest ? <span className="mt-1 block font-mono text-xs text-admin-faint">Ref: {error.digest}</span> : null}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => reset()} className={buttonClass()}>
              Try again
            </button>
            <Link href="/admin" className={buttonClass({ variant: "outline" })}>
              Back to dashboard
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
