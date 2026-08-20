"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import type { MonthlyPoint } from "@/lib/finance";
import { formatEUR, formatMonthLabel } from "@/lib/format";

export function InOutChart({ data }: { data: MonthlyPoint[] }) {
  const chartData = data.map((d) => ({ ...d, label: formatMonthLabel(d.month) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="label" stroke="var(--chart-axis)" fontSize={12} />
        <YAxis
          stroke="var(--chart-axis)"
          fontSize={12}
          tickFormatter={(v) => formatEUR(v)}
          width={90}
        />
        <Tooltip
          formatter={(value) => formatEUR(Number(value))}
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-grid)",
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        <Legend />
        <Bar dataKey="encaisse" name="Encaissé" fill="var(--chart-positive)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="depense" name="Dépensé" fill="var(--chart-negative)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
