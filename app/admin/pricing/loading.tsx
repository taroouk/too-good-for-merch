import { SkeletonPage } from "src/components/admin/ui/Skeleton";

export default function PricingLoading() {
  return <SkeletonPage statCount={3} tableRows={5} />;
}
