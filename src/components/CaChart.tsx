"use client";

import {
  Bar,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import type { MonthlyCaPoint } from "@/lib/finance";
import { formatEUR, formatMonthLabel } from "@/lib/format";

export function CaChart({
  data,
  previousYear = [],
}: {
  data: MonthlyCaPoint[];
  previousYear?: MonthlyCaPoint[];
}) {
  const hasPreviousYear = previousYear.length === data.length && previousYear.some((m) => m.ca !== 0);
  const previousYearLabel = previousYear[0]?.month.slice(0, 4);

  const chartData = data.map((d, i) => ({
    label: formatMonthLabel(d.month),
    ca: d.ca,
    caN1: hasPreviousYear ? previousYear[i].ca : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
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
        <Legend />
        <Bar dataKey="ca" name="CA facturé" fill="var(--chart-primary)" radius={[3, 3, 0, 0]} />
        {hasPreviousYear && (
          <Line
            type="monotone"
            dataKey="caN1"
            name={`CA facturé ${previousYearLabel}`}
            stroke="var(--chart-axis)"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            dot={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
