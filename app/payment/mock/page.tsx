import Link from "next/link";

export default function MockPaymentDisabledPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f1ed] px-4">
      <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
        <h1 className="text-2xl font-semibold">Mock payments are disabled</h1>
        <p className="mt-3 text-sm leading-6 text-black/55">Payment state can only be confirmed by Paymob’s signed server webhook.</p>
        <Link href="/studio" className="mt-6 inline-flex rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">Return to studio</Link>
      </div>
    </main>
  );
}
