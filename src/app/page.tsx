"use client";

import { useState } from "react";
import { KpiCard } from "@/components/KpiCard";
import { RefreshButton } from "@/components/RefreshButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { TreasuryChart } from "@/components/TreasuryChart";
import { InOutChart } from "@/components/InOutChart";
import { YearSwitcher } from "@/components/YearSwitcher";
import { useFetchJson } from "@/lib/useFetchJson";
import { formatEUR, formatMonths } from "@/lib/format";
import type { SummaryData, CustomerInvoiceRow } from "@/lib/finance";

interface CustomerInvoicesResponse {
  rows: CustomerInvoiceRow[];
  total: number;
}

export default function SynthesePage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, loading, error, refresh } = useFetchJson<SummaryData>(`/api/summary?year=${year}`);
  const { data: invoicesData, refresh: refreshInvoices } =
    useFetchJson<CustomerInvoicesResponse>("/api/customer-invoices");

  function refreshAll() {
    refresh();
    refreshInvoices();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Vue de synthèse</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Situation financière en temps réel — source Pennylane
          </p>
        </div>
        <div className="flex items-center gap-3">
          <YearSwitcher year={year} onChange={setYear} />
          <RefreshButton onRefresh={refreshAll} loading={loading} />
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {data && !error && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Trésorerie actuelle" value={formatEUR(data.treasury)} />
            <KpiCard
              label="Burn net du mois"
              value={formatEUR(data.burnNetMonth)}
              tone={data.burnNetMonth >= 0 ? "positive" : "negative"}
              hint={`Encaissé ${formatEUR(data.mtdEncaisse)} · Dépensé ${formatEUR(data.mtdDepense)}`}
            />
            <KpiCard
              label="Runway estimé"
              value={data.runwayMonths !== null ? formatMonths(data.runwayMonths) : "N/A"}
              tone={
                data.runwayMonths === null
                  ? "positive"
                  : data.runwayMonths < 6
                    ? "negative"
                    : data.runwayMonths < 12
                      ? "warning"
                      : "positive"
              }
              hint={
                data.runwayMonths === null
                  ? "Trésorerie non décroissante"
                  : `Burn net moyen ${formatEUR(data.avgBurnNet)}/mois`
              }
            />
            <KpiCard
              label="Factures clients en attente"
              value={invoicesData ? formatEUR(invoicesData.total) : "…"}
              hint={invoicesData ? `${invoicesData.rows.length} facture(s)` : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KpiCard
              label="Dépensé moyen par mois depuis le 1er janvier"
              value={formatEUR(data.ytdAvgMonthlyDepense)}
              hint={`Année ${new Date().getFullYear()} en cours`}
            />
          </div>

          <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
            <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Trésorerie {data.projection.length > 0 && "(avec projection)"}
            </h2>
            <TreasuryChart data={data.monthly} projection={data.projection} />
            {data.projection.length > 0 && (
              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                Projection en pointillés : trésorerie actuelle prolongée au rythme du burn net
                moyen ({formatEUR(data.avgBurnNet)}/mois) — indicative, pas une prévision.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
            <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Encaissé vs dépensé, mois par mois
            </h2>
            <InOutChart data={data.monthly} />
          </section>

          {data.nonEurAccountsCount > 0 && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {data.nonEurAccountsCount} compte(s) bancaire(s) hors EUR exclu(s) du calcul de
              trésorerie (pas de conversion disponible via l&apos;API).
            </p>
          )}
        </>
      )}

      {loading && !data && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Chargement des données Pennylane…</p>
      )}
    </div>
  );
}
