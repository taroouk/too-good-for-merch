import Link from "next/link";

export default async function OrderFailedPage({ params }: any) {
  const { orderId } = await params;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#1a0b0b] via-[#faf8f6] to-[#f3f1ee] px-4 py-14">

      <div className="mx-auto max-w-xl">

        <div className="rounded-[28px] bg-white p-8 shadow-[0_40px_120px_rgba(0,0,0,0.15)]">

          {/* ICON */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-red-600 text-3xl">
            ✕
          </div>

          {/* TITLE */}
          <div className="mt-6 text-center">
            <h1 className="text-4xl font-bold">
              Payment Failed
            </h1>

            <p className="mt-3 text-sm text-black/60">
              Something went wrong while processing your payment.
            </p>
          </div>

          {/* ERROR BOX */}
          <div className="mt-6 rounded-2xl bg-red-50 border border-red-100 p-5 text-sm text-red-700">
            <p className="font-semibold">Possible reasons:</p>
            <ul className="mt-2 list-disc list-inside space-y-1">
              <li>Insufficient balance</li>
              <li>Card declined by bank</li>
              <li>Incorrect card details</li>
            </ul>
          </div>

          {/* ACTIONS */}
          <div className="mt-8 space-y-3">

            <Link
              href={`/orders/${orderId}`}
              className="h-12 flex items-center justify-center rounded-xl bg-black text-white font-semibold hover:bg-gray-900"
            >
              Try Again
            </Link>

            <Link
              href="/support"
              className="h-12 flex items-center justify-center rounded-xl border font-semibold hover:bg-black hover:text-white"
            >
              Contact Support
            </Link>

            <Link
              href="/studio"
              className="text-sm text-center block text-black/50 hover:text-black"
            >
              Back to Studio
            </Link>

          </div>

          {/* FOOTER */}
          <p className="mt-6 text-center text-xs text-black/40">
            We only charge when payment is successful
          </p>

        </div>
      </div>
    </main>
  );
}