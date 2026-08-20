"use client";

import { useState } from "react";
import { RefreshButton } from "@/components/RefreshButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SortableTable, type Column } from "@/components/SortableTable";
import { CategoryPieChart } from "@/components/CategoryPieChart";
import { RankingBarChart } from "@/components/RankingBarChart";
import { KpiCard } from "@/components/KpiCard";
import { YearSwitcher } from "@/components/YearSwitcher";
import { useFetchJson } from "@/lib/useFetchJson";
import { formatEUR, formatDate } from "@/lib/format";
import type {
  CategoryBreakdown,
  CategoryRow,
  TopCustomerRow,
  TopCustomersResult,
  UncategorizedTransaction,
} from "@/lib/finance";

const categoryColumns: Column<CategoryRow>[] = [
  { key: "category", header: "Catégorie", accessor: (r) => r.category },
  {
    key: "amount",
    header: "Montant encaissé",
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

const customerColumns: Column<TopCustomerRow>[] = [
  { key: "customerName", header: "Client", accessor: (r) => r.customerName },
  {
    key: "amount",
    header: "Montant facturé",
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
    key: "invoiceCount",
    header: "Factures",
    align: "right",
    accessor: (r) => r.invoiceCount,
  },
];

export default function RevenusPage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const revenue = useFetchJson<CategoryBreakdown>(`/api/revenue?year=${year}`);
  const customers = useFetchJson<TopCustomersResult>(`/api/top-customers?year=${year}`);

  function refreshAll() {
    revenue.refresh();
    customers.refresh();
  }

  const loading = revenue.loading || customers.loading;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Revenus</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Ventilation des revenus par catégorie et top clients
          </p>
        </div>
        <div className="flex items-center gap-3">
          <YearSwitcher year={year} onChange={setYear} />
          <RefreshButton onRefresh={refreshAll} loading={loading} />
        </div>
      </div>

      {revenue.error && <ErrorBanner message={revenue.error} />}
      {customers.error && <ErrorBanner message={customers.error} />}

      {revenue.data && !revenue.error && (
        <>
          {!revenue.data.groupFound && (
            <div className="rounded-md border border-[var(--brand-pink)] bg-[var(--brand-blush)] px-4 py-3 text-sm text-[var(--brand-burgundy)]">
              Aucun groupe de catégories « Type de revenus » trouvé sur ce compte Pennylane.
              Tous les revenus apparaissent en « Non catégorisé ».
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label="Total encaissé"
              value={formatEUR(revenue.data.total)}
              tone="positive"
              hint={`Année ${revenue.data.year}`}
            />
            <KpiCard label="Catégories" value={String(revenue.data.rows.length)} />
            <KpiCard
              label="Non catégorisé"
              value={formatEUR(revenue.data.rows.find((r) => r.category === "Non catégorisé")?.amount ?? 0)}
              tone={revenue.data.uncategorized.length > 0 ? "warning" : "positive"}
              hint={
                revenue.data.uncategorized.length > 0
                  ? `${revenue.data.uncategorized.length} transaction(s)`
                  : undefined
              }
            />
          </div>

          <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
            <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Répartition des revenus par catégorie
            </h2>
            <CategoryPieChart rows={revenue.data.rows} />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
            <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">Détail par catégorie</h2>
            <SortableTable columns={categoryColumns} rows={revenue.data.rows} rowKey={(r) => r.category} />
          </section>

          {revenue.data.uncategorized.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
              <h2 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Transactions non catégorisées
              </h2>
              <p className="mb-4 text-xs text-zinc-400 dark:text-zinc-500">
                À catégoriser dans Pennylane (groupe « Type de revenus ») pour affiner cette
                répartition.
              </p>
              <SortableTable
                columns={uncategorizedColumns}
                rows={revenue.data.uncategorized}
                rowKey={(r) => r.id}
              />
            </section>
          )}
        </>
      )}

      {customers.data && !customers.error && (
        <>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Le top clients se base sur les factures clients (payées + en attente), une base
            différente de la ventilation par catégorie ci-dessus (basée sur les encaissements
            bancaires, qui incluent aussi des entrées hors facturation comme des financements) —
            les deux totaux ne coïncident donc pas nécessairement.
          </p>
          <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Top clients</h2>
              <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                Total : {formatEUR(customers.data.total)}
              </span>
            </div>
            <RankingBarChart
              rows={customers.data.rows.map((r) => ({ name: r.customerName, value: r.amount }))}
              color="var(--chart-primary)"
              valueLabel="Facturé"
            />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
            <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">Détail par client</h2>
            <SortableTable
              columns={customerColumns}
              rows={customers.data.rows}
              rowKey={(r) => r.customerName}
            />
          </section>
        </>
      )}
    </div>
  );
}
