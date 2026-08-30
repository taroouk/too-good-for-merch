import { SkeletonPage } from "src/components/admin/ui/Skeleton";

export default function BespokeLoading() {
  return <SkeletonPage statCount={0} tableRows={4} />;
}
