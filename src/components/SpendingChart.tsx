"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import type { SpendingCategoryRow } from "@/lib/finance";
import { formatEUR } from "@/lib/format";

export function SpendingChart({ rows }: { rows: SpendingCategoryRow[] }) {
  const top = [...rows].sort((a, b) => b.amount - a.amount).slice(0, 10);
  const height = Math.max(280, top.length * 36);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={top} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
        <XAxis type="number" stroke="var(--chart-axis)" fontSize={12} tickFormatter={(v) => formatEUR(v)} />
        <YAxis
          type="category"
          dataKey="category"
          stroke="var(--chart-axis)"
          fontSize={12}
          width={160}
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
        <Bar dataKey="amount" name="Dépensé" fill="var(--chart-negative)" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
