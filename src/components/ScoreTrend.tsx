// Score trend for a single repo: a "since last scan" delta plus a compact
// sparkline of recent scores. Presentational only — it receives the prior
// scores (oldest → newest) and the current score, and draws them left to right.

const W = 108; // sparkline viewBox width
const H = 28; // sparkline viewBox height
const PAD = 3; // inner padding so the end dot and line caps aren't clipped

export function ScoreTrend({
  priorScores,
  currentScore,
}: {
  /** Prior completed scores, oldest → newest, excluding the current scan. */
  priorScores: number[];
  currentScore: number;
}) {
  // Nothing to compare against yet — the first scan has no trend.
  if (priorScores.length === 0) {
    return <p className="mt-1.5 text-xs text-muted">First scan of this repo.</p>;
  }

  const previous = priorScores[priorScores.length - 1];
  const delta = currentScore - previous;
  const series = [...priorScores, currentScore];

  return (
    <div className="mt-1.5 flex items-center gap-3">
      <DeltaLabel delta={delta} />
      <Sparkline series={series} />
    </div>
  );
}

function DeltaLabel({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
        <span aria-hidden>→</span> No change since last scan
      </span>
    );
  }
  const up = delta > 0; // a higher safety score is better
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${
        up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
      }`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {up ? "+" : ""}
      {delta} since last scan
    </span>
  );
}

function Sparkline({ series }: { series: number[] }) {
  // Fit the line to the data's own range (padded) so small movements are visible,
  // while clamping to the 0–100 score domain.
  const min = Math.max(0, Math.min(...series) - 5);
  const max = Math.min(100, Math.max(...series) + 5);
  const span = max - min || 1; // avoid divide-by-zero when every score is equal

  const x = (i: number) =>
    series.length === 1 ? W - PAD : PAD + (i / (series.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const points = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lastX = x(series.length - 1);
  const lastY = y(series[series.length - 1]);
  const rising = series[series.length - 1] >= series[0];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={`shrink-0 ${rising ? "text-emerald-500" : "text-rose-500"}`}
      role="img"
      aria-label={`Score trend, most recent ${series.length} scans`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.2} fill="currentColor" />
    </svg>
  );
}
