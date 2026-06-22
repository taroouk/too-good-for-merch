export default function AdminLoading() {
  return <main className="p-5 sm:p-8"><div className="mx-auto max-w-7xl animate-pulse space-y-6"><div className="h-24 rounded-2xl bg-black/5"/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-32 rounded-2xl bg-black/5" />)}</div><div className="h-80 rounded-2xl bg-black/5" /></div></main>;
}
