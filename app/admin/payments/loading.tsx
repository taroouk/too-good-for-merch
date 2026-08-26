import { SkeletonPage } from "src/components/admin/ui/Skeleton";

export default function PaymentsLoading() {
  return <SkeletonPage statCount={5} tableRows={8} />;
}
