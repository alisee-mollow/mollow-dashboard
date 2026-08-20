"use client";

import { useState } from "react";
import { RefreshButton } from "@/components/RefreshButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SortableTable, type Column } from "@/components/SortableTable";
import { CategoryPieChart } from "@/components/CategoryPieChart";
import { KpiCard } from "@/components/KpiCard";
import { YearSwitcher } from "@/components/YearSwitcher";
import { useFetchJson } from "@/lib/useFetchJson";
import { formatEUR, formatDate } from "@/lib/format";
import type { CategoryBreakdown, CategoryRow, UncategorizedTransaction } from "@/lib/finance";

const columns: Column<CategoryRow>[] = [
  { key: "category", header: "Catégorie", accessor: (r) => r.category },
  {
    key: "amount",
    header: "Montant dépensé",
    align: "right",
    accessor: (r) => r.amount,
    render: (r) => formatEUR(r.amount),
  },
  {
    key: "share",
    header: "Part du total",
    align: "right",
    accessor: (r) => r.share,
    render: (r) => `${(r.share * 100).toFixed(1)} %`,
  },
  {
    key: "transactionCount",
    header: "Transactions",
    align: "right",
    accessor: (r) => r.transactionCount,
  },
];

const uncategorizedColumns: Column<UncategorizedTransaction>[] = [
  { key: "date", header: "Date", accessor: (r) => r.date, render: (r) => formatDate(r.date) },
  { key: "label", header: "Libellé bancaire", accessor: (r) => r.label ?? "—" },
  {
    key: "amount",
    header: "Montant",
    align: "right",
    accessor: (r) => r.amount,
    render: (r) => formatEUR(r.amount),
  },
];

export default function DepensesPage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, loading, error, refresh } = useFetchJson<CategoryBreakdown>(`/api/spending?year=${year}`);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Dépenses</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Ventilation des dépenses par catégorie (catégories analytiques Pennylane)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <YearSwitcher year={year} onChange={setYear} />
          <RefreshButton onRefresh={refresh} loading={loading} />
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {data && !error && (
        <>
          {!data.groupFound && (
            <div className="rounded-md border border-[var(--brand-pink)] bg-[var(--brand-blush)] px-4 py-3 text-sm text-[var(--brand-burgundy)]">
              Aucun groupe de catégories « Type de dépenses » trouvé sur ce compte Pennylane.
              Toutes les dépenses apparaissent en « Non catégorisé ». Vérifie le nom du groupe
              de catégories dans Pennylane (Comptabilité &gt; Catégories analytiques).
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label="Total dépensé" value={formatEUR(data.total)} hint={`Année ${data.year}`} />
            <KpiCard label="Catégories" value={String(data.rows.length)} />
            <KpiCard
              label="Non catégorisé"
              value={formatEUR(data.rows.find((r) => r.category === "Non catégorisé")?.amount ?? 0)}
              tone={data.uncategorized.length > 0 ? "warning" : "positive"}
              hint={data.uncategorized.length > 0 ? `${data.uncategorized.length} transaction(s)` : undefined}
            />
          </div>

          <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
            <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Répartition des dépenses par catégorie
            </h2>
            <CategoryPieChart rows={data.rows} />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
            <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">Détail par catégorie</h2>
            <SortableTable columns={columns} rows={data.rows} rowKey={(r) => r.category} />
          </section>

          {data.uncategorized.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
              <h2 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Transactions non catégorisées
              </h2>
              <p className="mb-4 text-xs text-zinc-400 dark:text-zinc-500">
                À catégoriser dans Pennylane (groupe « Type de dépenses ») pour affiner cette
                répartition.
              </p>
              <SortableTable
                columns={uncategorizedColumns}
                rows={data.uncategorized}
                rowKey={(r) => r.id}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
