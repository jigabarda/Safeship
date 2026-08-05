import { redirect } from "next/navigation";

// Scans now live with the repositories they belong to.
export default function ScansPage() {
  redirect("/repositories");
}
