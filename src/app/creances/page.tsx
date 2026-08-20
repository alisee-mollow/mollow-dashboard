"use client";

import { RefreshButton } from "@/components/RefreshButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SortableTable, type Column } from "@/components/SortableTable";
import { useFetchJson } from "@/lib/useFetchJson";
import { formatEUR, formatDate } from "@/lib/format";
import type { AcceptedQuoteRow, AcceptedQuotesResult, CustomerInvoiceRow, QuoteRow } from "@/lib/finance";

interface InvoicesResponse {
  rows: CustomerInvoiceRow[];
  total: number;
}
interface QuotesResponse {
  rows: QuoteRow[];
  total: number;
}

const invoiceColumns: Column<CustomerInvoiceRow>[] = [
  { key: "customerName", header: "Client", accessor: (r) => r.customerName },
  {
    key: "remainingAmount",
    header: "Montant restant dû",
    align: "right",
    accessor: (r) => r.remainingAmount,
    render: (r) => formatEUR(r.remainingAmount),
  },
  { key: "deadline", header: "Échéance", accessor: (r) => r.deadline, render: (r) => formatDate(r.deadline) },
  {
    key: "ageDays",
    header: "Ancienneté",
    align: "right",
    accessor: (r) => r.ageDays,
    render: (r) =>
      r.ageDays === null ? "—" : r.ageDays > 0 ? `${r.ageDays} j de retard` : `${-r.ageDays} j restants`,
  },
];

const quoteColumns: Column<QuoteRow>[] = [
  { key: "customerName", header: "Client", accessor: (r) => r.customerName },
  { key: "amount", header: "Montant", align: "right", accessor: (r) => r.amount, render: (r) => formatEUR(r.amount) },
  {
    key: "status",
    header: "Statut",
    accessor: (r) => r.status,
    render: (r) => (r.status === "expired" ? "Expiré" : "En attente"),
  },
  { key: "date", header: "Date d'envoi", accessor: (r) => r.date, render: (r) => formatDate(r.date) },
  {
    key: "daysSinceSent",
    header: "Jours depuis l'envoi",
    align: "right",
    accessor: (r) => r.daysSinceSent,
    render: (r) => (r.daysSinceSent === null ? "—" : `${r.daysSinceSent} j`),
  },
];

const acceptedQuoteColumns: Column<AcceptedQuoteRow>[] = [
  { key: "customerName", header: "Client", accessor: (r) => r.customerName },
  {
    key: "quoteAmount",
    header: "Montant du devis",
    align: "right",
    accessor: (r) => r.quoteAmount,
    render: (r) => formatEUR(r.quoteAmount),
  },
  {
    key: "invoicedAmount",
    header: "Déjà facturé",
    align: "right",
    accessor: (r) => r.invoicedAmount,
    render: (r) => formatEUR(r.invoicedAmount),
  },
  {
    key: "remainingAmount",
    header: "Restant à facturer",
    align: "right",
    accessor: (r) => r.remainingAmount,
    render: (r) => formatEUR(r.remainingAmount),
  },
  { key: "date", header: "Date d'acceptation", accessor: (r) => r.date, render: (r) => formatDate(r.date) },
];

export default function CreancesPage() {
  const invoices = useFetchJson<InvoicesResponse>("/api/customer-invoices");
  const quotes = useFetchJson<QuotesResponse>("/api/quotes");
  const acceptedQuotes = useFetchJson<AcceptedQuotesResult>("/api/accepted-quotes");

  function refreshAll() {
    invoices.refresh();
    quotes.refresh();
    acceptedQuotes.refresh();
  }

  const loading = invoices.loading || quotes.loading || acceptedQuotes.loading;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Créances et devis</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Factures clients en attente de paiement et devis non finalisés
          </p>
        </div>
        <RefreshButton onRefresh={refreshAll} loading={loading} />
      </div>

      {invoices.error && <ErrorBanner message={invoices.error} />}
      {quotes.error && <ErrorBanner message={quotes.error} />}
      {acceptedQuotes.error && <ErrorBanner message={acceptedQuotes.error} />}

      <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Factures clients en attente de paiement
          </h2>
          {invoices.data && (
            <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              Total : {formatEUR(invoices.data.total)}
            </span>
          )}
        </div>
        {invoices.data && (
          <SortableTable
            columns={invoiceColumns}
            rows={invoices.data.rows}
            rowKey={(r) => r.id}
            rowClassName={(r) =>
              r.ageDays !== null && r.ageDays > 0 ? "bg-[var(--brand-blush)] dark:bg-[var(--brand-burgundy)]/30" : ""
            }
          />
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Devis envoyés non acceptés (en attente + expirés)
          </h2>
          {quotes.data && (
            <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              Total : {formatEUR(quotes.data.total)}
            </span>
          )}
        </div>
        {quotes.data && <SortableTable columns={quoteColumns} rows={quotes.data.rows} rowKey={(r) => r.id} />}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Devis acceptés non (entièrement) facturés
          </h2>
          {acceptedQuotes.data && (
            <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              Restant à facturer : {formatEUR(acceptedQuotes.data.totalRemaining)}
            </span>
          )}
        </div>
        <p className="mb-4 text-xs text-zinc-400 dark:text-zinc-500">
          Certains devis sont facturés en plusieurs fois (acompte + solde) — seul le montant
          restant à facturer est pertinent pour anticiper la trésorerie à venir.
        </p>
        {acceptedQuotes.data && (
          <SortableTable columns={acceptedQuoteColumns} rows={acceptedQuotes.data.rows} rowKey={(r) => r.id} />
        )}
      </section>
    </div>
  );
}
