"use client";

import { useState } from "react";
import { RefreshButton } from "@/components/RefreshButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { KpiCard } from "@/components/KpiCard";
import { YearSwitcher } from "@/components/YearSwitcher";
import { CaChart } from "@/components/CaChart";
import { useFetchJson } from "@/lib/useFetchJson";
import { formatEUR } from "@/lib/format";
import type { AccrualRevenueData } from "@/lib/finance";

function yoyLabel(current: number, previous: number): string | undefined {
  if (previous <= 0) return undefined;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)} % vs même période N-1 (${formatEUR(previous)})`;
}

export default function CaPage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, loading, error, refresh } = useFetchJson<AccrualRevenueData>(`/api/ca?year=${year}`);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Chiffre d&apos;affaires</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            CA facturé (date d&apos;émission des factures clients, avoirs inclus) — indépendant
            de la trésorerie et des encaissements bancaires
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label="CA facturé"
              value={formatEUR(data.total)}
              hint={yoyLabel(data.total, data.previousYearTotal) ?? `Année ${data.year}`}
            />
            <KpiCard label="CA moyen par mois" value={formatEUR(data.avgMonthlyCa)} hint={`Année ${data.year}`} />
            <KpiCard label="Mois facturés" value={String(data.monthly.length)} hint={`Année ${data.year}`} />
          </div>

          <section className="rounded-xl border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800">
            <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              CA facturé par mois
            </h2>
            <CaChart data={data.monthly} previousYear={data.previousYearMonthly} />
          </section>

          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Basé sur les factures clients émises (hors brouillons), avoirs déduits. Le CA
            facturé diffère de l&apos;encaissé (voir l&apos;écran Revenus) : une facture peut être
            émise sans être encore payée, ou payée sur un mois différent de celui de son
            émission.
          </p>
        </>
      )}
    </div>
  );
}
