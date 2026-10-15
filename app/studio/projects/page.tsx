import { redirect } from "next/navigation";

// "My projects" no longer exists: the studio opens the customer's latest design
// directly (app/studio/page.tsx) and finished designs live in the bag, wishlist
// and orders. Old links and bookmarks land in the studio instead of a 404.
export default function ProjectsRedirect() {
  redirect("/studio");
}
