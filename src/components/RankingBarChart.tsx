"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { formatEUR } from "@/lib/format";

export interface RankingRow {
  name: string;
  value: number;
}

export function RankingBarChart({
  rows,
  color = "var(--chart-primary)",
  valueLabel = "Montant",
  maxItems = 10,
}: {
  rows: RankingRow[];
  color?: string;
  valueLabel?: string;
  maxItems?: number;
}) {
  const top = [...rows].sort((a, b) => b.value - a.value).slice(0, maxItems);
  const height = Math.max(280, top.length * 36);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={top} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
        <XAxis type="number" stroke="var(--chart-axis)" fontSize={12} tickFormatter={(v) => formatEUR(v)} />
        <YAxis type="category" dataKey="name" stroke="var(--chart-axis)" fontSize={12} width={160} />
        <Tooltip
          formatter={(value) => formatEUR(Number(value))}
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-grid)",
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        <Bar dataKey="value" name={valueLabel} fill={color} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
