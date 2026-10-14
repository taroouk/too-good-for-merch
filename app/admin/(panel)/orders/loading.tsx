import { SkeletonPage } from "src/components/admin/ui/Skeleton";

export default function OrdersLoading() {
  return <SkeletonPage statCount={6} tableRows={8} />;
}
