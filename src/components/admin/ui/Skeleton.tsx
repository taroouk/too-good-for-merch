export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-black/5 ${className}`} />;
}

export function SkeletonPage({ statCount = 5, tableRows = 6 }: { statCount?: number; tableRows?: number }) {
  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-7xl space-y-6">
        <SkeletonBlock className="h-20" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: statCount }).map((_, index) => (
            <SkeletonBlock key={index} className="h-24" />
          ))}
        </div>
        <SkeletonBlock className="h-16" />
        <div className="space-y-3">
          {Array.from({ length: tableRows }).map((_, index) => (
            <SkeletonBlock key={index} className="h-14" />
          ))}
        </div>
      </div>
    </main>
  );
}

export function SkeletonDetail() {
  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-7xl space-y-6">
        <SkeletonBlock className="h-28" />
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <SkeletonBlock className="h-64" />
            <SkeletonBlock className="h-40" />
          </div>
          <div className="space-y-6">
            <SkeletonBlock className="h-40" />
            <SkeletonBlock className="h-40" />
            <SkeletonBlock className="h-40" />
          </div>
        </div>
      </div>
    </main>
  );
}
