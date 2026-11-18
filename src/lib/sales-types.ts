// Types et calculs partagés entre la route /api/commercial (serveur) et la page
// /commercial (client) — sans dépendance serveur, pour que le filtre par commercial
// et les KPI se recalculent instantanément côté navigateur.

import type { QuoteStatus } from "./pennylane-types";

export type SalesInvoiceStatus = "paid" | "upcoming" | "late" | "partially_paid";

export interface SalesOwner {
  id: string; // hubspot owner id
  name: string;
  firstName: string | null;
}

export interface SalesQuoteRow {
  id: number;
  quoteNumber: string;
  customerName: string;
  ownerId: string | null;
  hubspotCompanyId: string | null;
  date: string | null;
  deadline: string | null;
  amountHT: number;
  status: QuoteStatus;
  invoiced: boolean; // au moins une facture émise depuis ce devis
}

export interface SalesInvoiceRow {
  id: number;
  invoiceNumber: string;
  customerName: string;
  ownerId: string | null;
  hubspotCompanyId: string | null;
  date: string | null;
  deadline: string | null;
  amountHT: number;
  collectedHT: number;
  status: SalesInvoiceStatus;
  quoteId: number | null;
  quoteNumber: string | null;
}

export interface UnmatchedCustomer {
  id: number;
  name: string;
  reason: "no_match" | "no_owner" | "ambiguous";
}

export interface SalesData {
  year: number;
  owners: SalesOwner[];
  quotes: SalesQuoteRow[];
  invoices: SalesInvoiceRow[];
  unmatchedCustomers: UnmatchedCustomer[];
}

// Valeurs spéciales du filtre commercial (les autres valeurs sont des owner ids).
export const ALL_OWNERS = "all";
export const UNASSIGNED = "none";

export function matchesOwner(row: { ownerId: string | null }, filter: string): boolean {
  if (filter === ALL_OWNERS) return true;
  if (filter === UNASSIGNED) return row.ownerId === null;
  return row.ownerId === filter;
}

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  pending: "En attente",
  accepted: "Accepté",
  invoiced: "Accepté (facturé)",
  denied: "Refusé",
  expired: "Expiré",
};

export const INVOICE_STATUS_LABELS: Record<SalesInvoiceStatus, string> = {
  paid: "Payée",
  upcoming: "À venir",
  late: "En retard",
  partially_paid: "Partiellement payée",
};

export const UNMATCHED_REASON_LABELS: Record<UnmatchedCustomer["reason"], string> = {
  no_match: "aucune entreprise HubSpot trouvée",
  no_owner: "entreprise HubSpot sans propriétaire",
  ambiguous: "plusieurs entreprises HubSpot avec des propriétaires différents",
};

export interface SalesKpis {
  quotesSent: number;
  signedHT: number;
  conversionRate: number | null; // devis transformés en facture / devis envoyés
  billedHT: number;
  collectedHT: number;
}

export function computeSalesKpis(quotes: SalesQuoteRow[], invoices: SalesInvoiceRow[]): SalesKpis {
  const signed = quotes.filter((q) => q.status === "accepted" || q.status === "invoiced");
  return {
    quotesSent: quotes.length,
    signedHT: signed.reduce((sum, q) => sum + q.amountHT, 0),
    conversionRate: quotes.length > 0 ? quotes.filter((q) => q.invoiced).length / quotes.length : null,
    billedHT: invoices.reduce((sum, i) => sum + i.amountHT, 0),
    collectedHT: invoices.reduce((sum, i) => sum + i.collectedHT, 0),
  };
}
