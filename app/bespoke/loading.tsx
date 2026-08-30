export default function BespokeLoading() {
  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <div className="mx-auto max-w-4xl">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-black/10" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white shadow-sm" />
          ))}
        </div>
      </div>
    </main>
  );
}
