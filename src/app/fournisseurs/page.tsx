"use client";

import { RefreshButton } from "@/components/RefreshButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SortableTable, type Column } from "@/components/SortableTable";
import { useFetchJson } from "@/lib/useFetchJson";
import { formatEUR, formatDate } from "@/lib/format";
import type { SupplierInvoiceRow } from "@/lib/finance";

interface SupplierInvoicesResponse {
  rows: SupplierInvoiceRow[];
  total: number;
}

const columns: Column<SupplierInvoiceRow>[] = [
  { key: "supplierName", header: "Fournisseur", accessor: (r) => r.supplierName },
  {
    key: "remainingAmount",
    header: "Montant restant dû",
    align: "right",
    accessor: (r) => r.remainingAmount,
    render: (r) => formatEUR(r.remainingAmount),
  },
  { key: "deadline", header: "Échéance", accessor: (r) => r.deadline, render: (r) => formatDate(r.deadline) },
];

export default function FournisseursPage() {
  const { data, loading, error, refresh } = useFetchJson<SupplierInvoicesResponse>("/api/supplier-invoices");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Factures fournisseurs</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Factures en attente de paiement — pour anticiper les sorties de trésorerie
          </p>
        </div>
        <RefreshButton onRefresh={refresh} loading={loading} />
      </div>

      {error && <ErrorBanner message={error} />}

      {data && (
        <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Factures fournisseurs en attente
            </h2>
            <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              Total : {formatEUR(data.total)}
            </span>
          </div>
          <SortableTable columns={columns} rows={data.rows} rowKey={(r) => r.id} />
        </section>
      )}
    </div>
  );
}
