// Instant placeholder shown by each route's loading.tsx while its server
// component fetches data. Matches the real header + content width so navigation
// feels immediate instead of frozen.

export function PageSkeleton({
  containerClass = "max-w-4xl",
  rows = 5,
}: {
  containerClass?: string;
  rows?: number;
}) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-background/80 backdrop-blur">
        <div className={`mx-auto flex h-14 w-full ${containerClass} items-center gap-4 px-6`}>
          <div className="h-5 w-24 animate-pulse rounded bg-surface-2" />
          <div className="hidden gap-2 sm:flex">
            <div className="h-7 w-24 animate-pulse rounded-full bg-surface-2" />
            <div className="h-7 w-20 animate-pulse rounded-full bg-surface-2" />
            <div className="h-7 w-20 animate-pulse rounded-full bg-surface-2" />
          </div>
          <div className="ml-auto h-7 w-16 animate-pulse rounded-full bg-surface-2" />
        </div>
      </header>

      <main className={`mx-auto flex w-full ${containerClass} flex-1 flex-col gap-6 px-6 py-10`}>
        <div className="flex flex-col gap-2">
          <div className="h-7 w-48 animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-surface-2" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      </main>
    </>
  );
}
