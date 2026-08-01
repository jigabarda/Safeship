import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton containerClass="max-w-4xl" rows={8} />;
}
