import { SkeletonPage } from "src/components/admin/ui/Skeleton";

export default function UsersLoading() {
  // Customers has no stat-card row, just a header, a search bar, and a table.
  return <SkeletonPage statCount={0} tableRows={8} />;
}
