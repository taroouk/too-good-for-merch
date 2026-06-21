export default async function Failed({
  params,
}: {
  params: { orderId: string };
}) {
  const { orderId } = params;

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f5f5f3] px-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-lg p-8 text-center">

        {/* icon */}
        <div className="w-16 h-16 mx-auto rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl">
          ✕
        </div>

        {/* title */}
        <h1 className="text-2xl font-bold mt-5">
          Payment Failed
        </h1>

        <p className="text-sm text-gray-500 mt-2">
          Something went wrong while processing your payment
        </p>

        {/* error hint */}
        <div className="mt-6 text-sm bg-red-50 text-red-700 p-3 rounded-xl">
          Please try again or use another payment method
        </div>

        {/* CTA */}
        <div className="mt-6 space-y-3">
          <a
            href={`/orders/${orderId}`}
            className="block w-full bg-black text-white py-3 rounded-xl"
          >
            Try Again
          </a>

          <a
            href="/orders"
            className="block w-full border py-3 rounded-xl"
          >
            Back to Orders
          </a>
        </div>

      </div>
    </main>
  );
}