"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { MonthlyPoint } from "@/lib/finance";
import { formatEUR, formatMonthLabel } from "@/lib/format";

export function TreasuryChart({ data }: { data: MonthlyPoint[] }) {
  const chartData = data.map((d) => ({ ...d, label: formatMonthLabel(d.month) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
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
        <Line
          type="monotone"
          dataKey="treasuryEnd"
          name="Trésorerie"
          stroke="var(--chart-primary)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
