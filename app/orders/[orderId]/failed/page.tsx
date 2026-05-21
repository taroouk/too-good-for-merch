import Link from "next/link";

type FailedPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

export default async function OrderFailedPage({ params }: FailedPageProps) {
  const { orderId } = await params;

  return (
    <main className="min-h-screen bg-[#faf8f6] px-4 py-10 text-black">
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-6 text-center shadow">
        <h1 className="text-3xl font-semibold">Payment Failed</h1>

        <p className="mt-3 text-sm text-black/60">
          The payment was not completed. You can try again.
        </p>

        <Link
          href={`/orders/${orderId}`}
          className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-black px-6 text-sm font-semibold text-white"
        >
          Back to Order
        </Link>
      </div>
    </main>
  );
}