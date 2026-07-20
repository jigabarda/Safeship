import Link from "next/link";

/** Shield-with-check brand mark. */
export function ShieldMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M12 2.5l7 2.6v5.3c0 4.3-2.9 8.3-7 9.6-4.1-1.3-7-5.3-7-9.6V5.1l7-2.6z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8.6 12.2l2.3 2.3 4.5-4.7"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wordmark + mark, links home. `size` controls the text scale. */
export function Logo({ href = "/", size = "md" }: { href?: string; size?: "sm" | "md" }) {
  const text = size === "sm" ? "text-sm" : "text-base";
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 font-semibold tracking-tight transition-opacity hover:opacity-80"
    >
      <span className="text-brand">
        <ShieldMark className={size === "sm" ? "h-5 w-5" : "h-6 w-6"} />
      </span>
      <span className={text}>
        Safe<span className="text-brand">ship</span>
      </span>
    </Link>
  );
}
