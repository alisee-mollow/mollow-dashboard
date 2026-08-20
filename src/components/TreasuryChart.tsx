"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { MonthlyPoint, ProjectedPoint } from "@/lib/finance";
import { formatEUR, formatMonthLabel } from "@/lib/format";

interface ChartPoint {
  label: string;
  treasuryEnd: number | null;
  treasuryProjected: number | null;
}

export function TreasuryChart({
  data,
  projection = [],
}: {
  data: MonthlyPoint[];
  projection?: ProjectedPoint[];
}) {
  const actual: ChartPoint[] = data.map((d) => ({
    label: formatMonthLabel(d.month),
    treasuryEnd: d.treasuryEnd,
    treasuryProjected: null,
  }));

  // Le dernier point réel porte aussi la valeur projetée (au lieu d'ajouter une
  // entrée séparée avec le même mois) pour que le trait en pointillés reparte sans
  // discontinuité ni doublon du mois courant sur l'axe des abscisses.
  if (projection.length > 0 && actual.length > 0) {
    actual[actual.length - 1].treasuryProjected = actual[actual.length - 1].treasuryEnd;
  }

  const projected: ChartPoint[] = projection.map((p) => ({
    label: formatMonthLabel(p.month),
    treasuryEnd: null,
    treasuryProjected: p.treasuryEnd,
  }));

  const chartData = [...actual, ...projected];
  const hasNegativeProjection = projection.some((p) => p.treasuryEnd <= 0);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="label" stroke="var(--chart-axis)" fontSize={12} />
        <YAxis stroke="var(--chart-axis)" fontSize={12} tickFormatter={(v) => formatEUR(v)} width={90} />
        <Tooltip
          formatter={(value) => (value === null ? "—" : formatEUR(Number(value)))}
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-grid)",
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        {hasNegativeProjection && <ReferenceLine y={0} stroke="var(--tone-negative)" strokeDasharray="3 3" />}
        <Line
          type="monotone"
          dataKey="treasuryEnd"
          name="Trésorerie"
          stroke="var(--chart-primary)"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="treasuryProjected"
          name="Trésorerie projetée"
          stroke="var(--chart-primary)"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
