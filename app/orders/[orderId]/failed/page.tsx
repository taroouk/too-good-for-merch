import Link from "next/link";

export default async function Failed({ params }: any) {
  const { orderId } = await params;

  return (
    <main className="min-h-screen bg-[#0b0b0f] flex items-center justify-center px-4">

      <div className="w-full max-w-xl">

        <div className="bg-white rounded-[28px] shadow-2xl p-8">

          {/* ICON */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white text-2xl">
              ✕
            </div>
          </div>

          {/* TITLE */}
          <h1 className="text-center text-3xl font-bold mt-5">
            Payment failed
          </h1>

          <p className="text-center text-black/60 mt-2">
            We couldn’t process your payment.
          </p>

          {/* STRIPE STYLE ERROR BOX */}
          <div className="mt-6 bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
            <p className="font-semibold mb-2">What happened?</p>
            <p>• Bank declined transaction</p>
            <p>• Card details incorrect</p>
            <p>• Insufficient funds</p>
          </div>

          {/* ACTIONS */}
          <div className="mt-6 space-y-3">

            <Link
              href={`/orders/${orderId}`}
              className="h-11 flex items-center justify-center rounded-xl bg-black text-white"
            >
              Try again
            </Link>

            <Link
              href="/studio"
              className="h-11 flex items-center justify-center rounded-xl border"
            >
              Back to studio
            </Link>

          </div>

          {/* HELP */}
          <p className="text-center text-xs text-black/40 mt-6">
            Need help? support@toogoodformerch.com
          </p>

        </div>
      </div>
    </main>
  );
}