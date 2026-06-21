export default function SuccessPage({ params }: any) {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-green-600">
          Payment Successful
        </h1>
        <p className="mt-2">Order ID: {params.orderId}</p>
      </div>
    </main>
  );
}