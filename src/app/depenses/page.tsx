"use client";

import { RefreshButton } from "@/components/RefreshButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SortableTable, type Column } from "@/components/SortableTable";
import { SpendingChart } from "@/components/SpendingChart";
import { KpiCard } from "@/components/KpiCard";
import { useFetchJson } from "@/lib/useFetchJson";
import { formatEUR } from "@/lib/format";
import type { SpendingBreakdown, SpendingCategoryRow } from "@/lib/finance";

const columns: Column<SpendingCategoryRow>[] = [
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

export default function DepensesPage() {
  const { data, loading, error, refresh } = useFetchJson<SpendingBreakdown>("/api/spending");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Dépenses</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Ventilation des dépenses par catégorie (catégories analytiques Pennylane, {data?.periodMonths ?? 12}{" "}
            derniers mois)
          </p>
        </div>
        <RefreshButton onRefresh={refresh} loading={loading} />
      </div>

      {error && <ErrorBanner message={error} />}

      {data && !error && (
        <>
          {!data.expenseGroupFound && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              Aucun groupe de catégories « Type de dépenses » trouvé sur ce compte Pennylane.
              Toutes les dépenses apparaissent en « Non catégorisé ». Vérifie le nom du groupe
              de catégories dans Pennylane (Comptabilité &gt; Catégories analytiques).
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label="Total dépensé" value={formatEUR(data.total)} hint={`Sur ${data.periodMonths} mois`} />
            <KpiCard label="Catégories" value={String(data.rows.length)} />
            <KpiCard
              label="Non catégorisé"
              value={formatEUR(data.rows.find((r) => r.category === "Non catégorisé")?.amount ?? 0)}
              tone={data.rows.find((r) => r.category === "Non catégorisé") ? "warning" : "positive"}
            />
          </div>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Top 10 catégories de dépenses
            </h2>
            <SpendingChart rows={data.rows} />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">Détail par catégorie</h2>
            <SortableTable columns={columns} rows={data.rows} rowKey={(r) => r.category} />
          </section>
        </>
      )}
    </div>
  );
}
