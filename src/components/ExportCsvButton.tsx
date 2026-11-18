"use client";

import { downloadCsv, toCsv, type CsvColumn } from "@/lib/csv";

export function ExportCsvButton<T>({
  filename,
  columns,
  rows,
}: {
  filename: string;
  columns: CsvColumn<T>[];
  rows: T[];
}) {
  return (
    <button
      onClick={() => downloadCsv(filename, toCsv(columns, rows))}
      disabled={rows.length === 0}
      className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-[var(--brand-blush)] hover:text-[var(--brand-burgundy)] disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-[var(--brand-pink)]"
    >
      Export CSV
    </button>
  );
}
