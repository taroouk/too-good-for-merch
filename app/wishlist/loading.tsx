export default function WishlistLoading() {
  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <div className="mx-auto max-w-5xl">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-black/10" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="h-52 animate-pulse bg-black/5" />
              <div className="space-y-3 p-5">
                <div className="h-5 w-2/3 animate-pulse rounded bg-black/10" />
                <div className="h-4 w-full animate-pulse rounded bg-black/5" />
                <div className="h-10 w-full animate-pulse rounded-xl bg-black/10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
