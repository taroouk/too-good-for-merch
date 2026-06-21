import Link from "next/link";

export default async function Failed({ params }: any) {
  const { orderId } = await params;

  return (
    <main className="min-h-screen bg-[#f6f5f3] relative">

      <div className="absolute top-[-120px] right-[-120px] w-[300px] h-[300px] bg-red-200 blur-3xl opacity-30" />

      <div className="max-w-2xl mx-auto px-6 py-16">

        <div className="bg-white rounded-[32px] shadow-[0_30px_120px_rgba(0,0,0,0.12)] p-10">

          {/* BADGE */}
          <div className="flex justify-center">
            <div className="bg-red-100 text-red-700 px-4 py-2 rounded-full text-xs font-semibold">
              PAYMENT FAILED
            </div>
          </div>

          {/* ICON */}
          <div className="mt-6 flex justify-center">
            <div className="w-20 h-20 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-3xl">
              ✕
            </div>
          </div>

          {/* TITLE */}
          <h1 className="text-center text-4xl font-bold mt-6">
            Payment Failed
          </h1>

          <p className="text-center text-black/60 mt-3">
            Something went wrong while processing your payment.
          </p>

          {/* ERROR BOX */}
          <div className="mt-8 bg-red-50 border border-red-100 rounded-2xl p-5 text-sm text-red-700">
            <p className="font-semibold mb-2">Try this:</p>
            <p>• Check your card details</p>
            <p>• Make sure balance is available</p>
            <p>• Try another payment method</p>
          </div>

          {/* ACTIONS */}
          <div className="mt-10 space-y-3">

            <Link
              href={`/orders/${orderId}`}
              className="h-12 flex items-center justify-center bg-black text-white rounded-xl"
            >
              Try Again
            </Link>

            <Link
              href="/studio"
              className="h-12 flex items-center justify-center border rounded-xl"
            >
              Back to Studio
            </Link>

          </div>

        </div>
      </div>
    </main>
  );
}