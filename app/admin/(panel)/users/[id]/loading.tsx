import { SkeletonBlock } from "src/components/admin/ui/Skeleton";

export default function CustomerDetailLoading() {
  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-5xl space-y-6">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-32" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-16" />
          ))}
        </div>
      </div>
    </main>
  );
}
