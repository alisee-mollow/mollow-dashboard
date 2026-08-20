export function KpiCard({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
  hint?: string;
}) {
  const toneClass = {
    neutral: "text-zinc-900 dark:text-zinc-50",
    positive: "text-[var(--tone-positive)]",
    negative: "text-[var(--tone-negative)]",
    warning: "text-[var(--tone-warning)]",
  }[tone];

  return (
    <div className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>}
    </div>
  );
}
