import Link from "next/link";

type FailedPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

export default async function OrderFailedPage({ params }: FailedPageProps) {
  const { orderId } = await params;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#faf8f6] to-[#f3f1ee] px-4 py-12 text-black">

      {/* CARD */}
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-[0_25px_80px_rgba(0,0,0,0.10)]">

        {/* ICON */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 text-2xl">
          ✕
        </div>

        {/* TITLE */}
        <h1 className="mt-6 text-4xl font-bold tracking-tight">
          Payment Failed
        </h1>

        {/* DESCRIPTION */}
        <p className="mt-3 text-sm text-black/60 leading-6">
          Unfortunately, your payment was not completed successfully.
          You can try again or use a different payment method.
        </p>

        {/* ERROR BOX */}
        <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
          <p className="font-medium">What you can do:</p>
          <ul className="mt-2 space-y-1 text-left list-disc list-inside">
            <li>Check your card details</li>
            <li>Make sure you have sufficient balance</li>
            <li>Try another payment method</li>
          </ul>
        </div>

        {/* CTA BUTTONS */}
        <div className="mt-8 space-y-3">

          <Link
            href={`/orders/${orderId}`}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-black text-sm font-semibold text-white hover:bg-gray-900 transition"
          >
            Try Again
          </Link>

          <Link
            href={`/orders/${orderId}`}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-black text-sm font-semibold hover:bg-black hover:text-white transition"
          >
            Back to Order
          </Link>

        </div>

        {/* FOOTER */}
        <p className="mt-6 text-xs text-black/40">
          Need help? Contact support@toogoodformerch.com
        </p>

      </div>
    </main>
  );
}