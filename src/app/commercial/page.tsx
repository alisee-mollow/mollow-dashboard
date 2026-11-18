"use client";

import { useMemo, useState } from "react";
import { RefreshButton } from "@/components/RefreshButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { KpiCard } from "@/components/KpiCard";
import { YearSwitcher } from "@/components/YearSwitcher";
import { SortableTable, type Column } from "@/components/SortableTable";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { useFetchJson } from "@/lib/useFetchJson";
import { formatDate, formatEUR } from "@/lib/format";
import type { CsvColumn } from "@/lib/csv";
import {
  ALL_OWNERS,
  INVOICE_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  UNASSIGNED,
  UNMATCHED_REASON_LABELS,
  computeSalesKpis,
  matchesOwner,
  type SalesData,
  type SalesInvoiceRow,
  type SalesQuoteRow,
} from "@/lib/sales-types";

// Commercial sélectionné à l'ouverture de la page (repli sur "Tous" s'il n'existe
// pas dans HubSpot).
const DEFAULT_OWNER_FIRST_NAME = "Antonin";

const quoteColumns: Column<SalesQuoteRow>[] = [
  { key: "quoteNumber", header: "Numéro", accessor: (r) => r.quoteNumber },
  { key: "customerName", header: "Client", accessor: (r) => r.customerName },
  { key: "date", header: "Émission", accessor: (r) => r.date, render: (r) => formatDate(r.date) },
  { key: "deadline", header: "Validité", accessor: (r) => r.deadline, render: (r) => formatDate(r.deadline) },
  { key: "amountHT", header: "Montant HT", align: "right", accessor: (r) => r.amountHT, render: (r) => formatEUR(r.amountHT) },
  { key: "status", header: "Statut", accessor: (r) => QUOTE_STATUS_LABELS[r.status] ?? r.status },
];

const invoiceColumns: Column<SalesInvoiceRow>[] = [
  { key: "invoiceNumber", header: "Numéro", accessor: (r) => r.invoiceNumber },
  { key: "customerName", header: "Client", accessor: (r) => r.customerName },
  { key: "date", header: "Date", accessor: (r) => r.date, render: (r) => formatDate(r.date) },
  { key: "deadline", header: "Échéance", accessor: (r) => r.deadline, render: (r) => formatDate(r.deadline) },
  { key: "amountHT", header: "Montant HT", align: "right", accessor: (r) => r.amountHT, render: (r) => formatEUR(r.amountHT) },
  { key: "status", header: "Statut", accessor: (r) => INVOICE_STATUS_LABELS[r.status] ?? r.status },
  { key: "quoteNumber", header: "Devis d'origine", accessor: (r) => r.quoteNumber, render: (r) => r.quoteNumber ?? "—" },
];

function csvDate(value: string | null): string | null {
  return value ? formatDate(value) : null;
}

export default function CommercialPage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [ownerChoice, setOwnerChoice] = useState<string | null>(null);
  const { data, loading, error, refresh } = useFetchJson<SalesData>(`/api/commercial?year=${year}`);

  const ownerNames = useMemo(() => new Map(data?.owners.map((o) => [o.id, o.name]) ?? []), [data]);
  const defaultOwner = data?.owners.find((o) => o.firstName === DEFAULT_OWNER_FIRST_NAME)?.id ?? ALL_OWNERS;
  const owner = ownerChoice ?? defaultOwner;
  const ownerName = (id: string | null) => (id ? ownerNames.get(id) ?? `#${id}` : "Non attribué");

  const quotes = useMemo(() => data?.quotes.filter((r) => matchesOwner(r, owner)) ?? [], [data, owner]);
  const invoices = useMemo(() => data?.invoices.filter((r) => matchesOwner(r, owner)) ?? [], [data, owner]);
  const kpis = computeSalesKpis(quotes, invoices);

  const fileSuffix = `${owner === ALL_OWNERS ? "tous" : owner === UNASSIGNED ? "non-attribues" : ownerName(owner).toLowerCase().replace(/\s+/g, "-")}-${data?.year ?? year}`;

  const quoteCsv: CsvColumn<SalesQuoteRow>[] = [
    { header: "ID Pennylane", value: (r) => String(r.id) },
    { header: "Numéro", value: (r) => r.quoteNumber },
    { header: "Client", value: (r) => r.customerName },
    { header: "Commercial", value: (r) => ownerName(r.ownerId) },
    { header: "ID entreprise HubSpot", value: (r) => r.hubspotCompanyId },
    { header: "Date d'émission", value: (r) => csvDate(r.date) },
    { header: "Date de validité", value: (r) => csvDate(r.deadline) },
    { header: "Montant HT", value: (r) => r.amountHT },
    { header: "Statut", value: (r) => QUOTE_STATUS_LABELS[r.status] ?? r.status },
    { header: "Transformé en facture", value: (r) => (r.invoiced ? "oui" : "non") },
  ];

  const invoiceCsv: CsvColumn<SalesInvoiceRow>[] = [
    { header: "ID Pennylane", value: (r) => String(r.id) },
    { header: "Numéro", value: (r) => r.invoiceNumber },
    { header: "Client", value: (r) => r.customerName },
    { header: "Commercial", value: (r) => ownerName(r.ownerId) },
    { header: "ID entreprise HubSpot", value: (r) => r.hubspotCompanyId },
    { header: "Date", value: (r) => csvDate(r.date) },
    { header: "Échéance", value: (r) => csvDate(r.deadline) },
    { header: "Montant HT", value: (r) => r.amountHT },
    { header: "Encaissé HT", value: (r) => r.collectedHT },
    { header: "Statut", value: (r) => INVOICE_STATUS_LABELS[r.status] ?? r.status },
    { header: "Devis d'origine", value: (r) => r.quoteNumber },
    { header: "ID Pennylane du devis", value: (r) => (r.quoteId ? String(r.quoteId) : null) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Facturation par commercial</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Devis et factures attribués au propriétaire de l&apos;entreprise cliente dans HubSpot — montants HT
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={owner}
            onChange={(e) => setOwnerChoice(e.target.value)}
            aria-label="Commercial"
            className="rounded-md border border-zinc-200 bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-zinc-900 dark:border-zinc-800 dark:text-zinc-50"
          >
            <option value={ALL_OWNERS}>Tous</option>
            {data?.owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value={UNASSIGNED}>Non attribué</option>
          </select>
          <YearSwitcher year={year} onChange={setYear} />
          <RefreshButton onRefresh={refresh} loading={loading} />
        </div>
      </div>

      {error && <ErrorBanner message={error} source="Pennylane / HubSpot" />}

      {data && !error && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="Devis envoyés" value={String(kpis.quotesSent)} hint={`Année ${data.year}`} />
            <KpiCard label="Montant HT signé" value={formatEUR(kpis.signedHT)} hint="Devis acceptés" />
            <KpiCard
              label="Transformation devis → facture"
              value={kpis.conversionRate === null ? "—" : `${Math.round(kpis.conversionRate * 100)} %`}
              hint="Devis de l'année ayant au moins une facture"
            />
            <KpiCard label="Montant HT facturé" value={formatEUR(kpis.billedHT)} hint={`${invoices.length} factures`} />
            <KpiCard
              label="Montant HT encaissé"
              value={formatEUR(kpis.collectedHT)}
              tone={kpis.collectedHT < kpis.billedHT ? "warning" : "neutral"}
              hint={`Reste dû : ${formatEUR(kpis.billedHT - kpis.collectedHT)}`}
            />
          </div>

          <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Devis ({quotes.length})</h2>
              <ExportCsvButton filename={`devis-${fileSuffix}.csv`} columns={quoteCsv} rows={quotes} />
            </div>
            <SortableTable columns={quoteColumns} rows={quotes} rowKey={(r) => r.id} />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Factures ({invoices.length})</h2>
              <ExportCsvButton filename={`factures-${fileSuffix}.csv`} columns={invoiceCsv} rows={invoices} />
            </div>
            <SortableTable
              columns={invoiceColumns}
              rows={invoices}
              rowKey={(r) => r.id}
              rowClassName={(r) =>
                r.status === "late" ? "bg-[var(--brand-blush)] dark:bg-[var(--brand-burgundy)]/30" : ""
              }
            />
          </section>

          {data.unmatchedCustomers.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
              <h2 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Clients non attribués en {data.year} ({data.unmatchedCustomers.length})
              </h2>
              <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
                Leurs documents apparaissent sous « Non attribué ». Pour les rattacher, aligne le nom
                de l&apos;entreprise HubSpot sur celui du client Pennylane (ou renseigne son domaine)
                et assigne-lui un propriétaire.
              </p>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {data.unmatchedCustomers.map((c) => (
                  <li key={c.id} className="text-zinc-700 dark:text-zinc-300">
                    {c.name} <span className="text-xs text-zinc-400">— {UNMATCHED_REASON_LABELS[c.reason]}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Pennylane n&apos;indique pas qui a créé un devis ou une facture : chaque document est
            attribué au propriétaire de l&apos;entreprise HubSpot correspondant au client (rapprochement
            par nom, puis par domaine e-mail). Factures : hors brouillons, avoirs, annulées et
            archivées. HT = montant − TVA, comme sur l&apos;écran Chiffre d&apos;affaires.
          </p>
        </>
      )}
    </div>
  );
}
