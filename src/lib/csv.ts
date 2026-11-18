// Génération et téléchargement de CSV côté navigateur, au format attendu par
// Excel en français : séparateur ";", virgule décimale, BOM UTF-8 pour les accents.

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null;
}

function formatCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? value.toFixed(2).replace(".", ",") : value;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [
    columns.map((c) => formatCell(c.header)).join(";"),
    ...rows.map((row) => columns.map((c) => formatCell(c.value(row))).join(";")),
  ];
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
