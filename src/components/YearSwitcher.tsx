"use client";

// Année la plus ancienne navigable — les données Pennylane de Mollow démarrent
// début 2024 ; ajuster si des exercices antérieurs sont importés un jour.
const MIN_YEAR = 2024;

export function YearSwitcher({
  year,
  onChange,
}: {
  year: number;
  onChange: (year: number) => void;
}) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex items-center gap-1 rounded-md border border-zinc-200 bg-[var(--surface)] p-1 dark:border-zinc-800">
      <button
        onClick={() => onChange(year - 1)}
        disabled={year <= MIN_YEAR}
        aria-label="Année précédente"
        className="rounded px-2 py-1 text-sm text-zinc-500 transition-colors hover:bg-[var(--brand-blush)] hover:text-[var(--brand-burgundy)] disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-[var(--brand-pink)]"
      >
        ‹
      </button>
      <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {year}
      </span>
      <button
        onClick={() => onChange(year + 1)}
        disabled={year >= currentYear}
        aria-label="Année suivante"
        className="rounded px-2 py-1 text-sm text-zinc-500 transition-colors hover:bg-[var(--brand-blush)] hover:text-[var(--brand-burgundy)] disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-[var(--brand-pink)]"
      >
        ›
      </button>
    </div>
  );
}
