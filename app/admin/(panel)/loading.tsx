import { SkeletonPage } from "src/components/admin/ui/Skeleton";

export default function AdminLoading() {
  return <SkeletonPage statCount={5} tableRows={0} />;
}
