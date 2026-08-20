"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategoryRow } from "@/lib/finance";
import { formatEUR } from "@/lib/format";

const SLICE_COLORS = [
  "var(--chart-cat-1)",
  "var(--chart-cat-2)",
  "var(--chart-cat-3)",
  "var(--chart-cat-4)",
  "var(--chart-cat-5)",
];
const OTHER_COLOR = "var(--chart-cat-other)";
const MAX_SLICES = 5;
// Seuil en dessous duquel on n'imprime pas le libellé directement sur la part
// (trop petit pour être lisible) — la légende et le tableau détaillé le portent.
const LABEL_SHARE_THRESHOLD = 0.06;

interface Slice {
  category: string;
  amount: number;
  share: number;
}

export function CategoryPieChart({ rows }: { rows: CategoryRow[] }) {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, MAX_SLICES);
  const rest = sorted.slice(MAX_SLICES);

  const slices: Slice[] = top.map((r) => ({ category: r.category, amount: r.amount, share: r.share }));
  if (rest.length > 0) {
    const amount = rest.reduce((sum, r) => sum + r.amount, 0);
    const share = rest.reduce((sum, r) => sum + r.share, 0);
    slices.push({ category: "Autres", amount, share });
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <PieChart>
        <Pie
          data={slices}
          dataKey="amount"
          nameKey="category"
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={2}
          strokeWidth={0}
          label={(props) => {
            const { share, category } = props as unknown as Slice;
            return share >= LABEL_SHARE_THRESHOLD ? `${category} · ${(share * 100).toFixed(0)}%` : "";
          }}
          labelLine={false}
        >
          {slices.map((s, i) => (
            <Cell
              key={s.category}
              fill={s.category === "Autres" ? OTHER_COLOR : SLICE_COLORS[i % SLICE_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name, item) => {
            const share = (item.payload as Slice).share;
            return [`${formatEUR(Number(value))} (${(share * 100).toFixed(1)} %)`, name];
          }}
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-grid)",
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        <Legend
          layout="vertical"
          verticalAlign="middle"
          align="right"
          wrapperStyle={{ fontSize: 13, color: "var(--chart-axis)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
