import { redirect } from "next/navigation";

export default async function FailedPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  redirect(`/orders/${orderId}`);
}
