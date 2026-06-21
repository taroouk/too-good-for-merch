export default async function Failed({ params }: any) {
  return (
    <main className="p-10 text-center">
      <h1 className="text-3xl font-bold text-red-600">
        Payment Failed
      </h1>

      <p className="mt-2">Something went wrong</p>

      <a
        href={`/orders/${params.orderId}`}
        className="mt-6 inline-block border px-6 py-2 rounded-xl"
      >
        Try Again
      </a>
    </main>
  );
}