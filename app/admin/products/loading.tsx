import { SkeletonPage } from "src/components/admin/ui/Skeleton";

export default function ProductsLoading() {
  return <SkeletonPage statCount={3} tableRows={4} />;
}
