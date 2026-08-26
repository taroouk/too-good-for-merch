import { SkeletonBlock } from "src/components/admin/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-5xl space-y-6">
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-52" />
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonBlock className="h-72" />
          <SkeletonBlock className="h-72" />
        </div>
        <SkeletonBlock className="h-24" />
      </div>
    </main>
  );
}
