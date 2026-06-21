export default async function SuccessPage({
  params,
}: {
  params: { orderId: string };
}) {
  const { orderId } = params;

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f5f5f3] px-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-lg p-8 text-center">

        {/* icon */}
        <div className="w-16 h-16 mx-auto rounded-full bg-green-100 text-green-600 flex items-center justify-center text-2xl">
          ✓
        </div>

        {/* title */}
        <h1 className="text-2xl font-bold mt-5">
          Payment Successful
        </h1>

        <p className="text-sm text-gray-500 mt-2">
          Your order has been confirmed
        </p>

        {/* order id */}
        <div className="mt-6 text-sm bg-gray-50 p-3 rounded-xl">
          Order ID: {orderId}
        </div>

        {/* CTA */}
        <div className="mt-6 space-y-3">
          <a
            href={`/orders/${orderId}`}
            className="block w-full bg-black text-white py-3 rounded-xl"
          >
            View Order
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