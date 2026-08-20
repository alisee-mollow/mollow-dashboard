import "server-only";
import { fetchAllPages } from "./pennylane";
import type {
  BankAccount,
  Transaction,
  CustomerInvoice,
  SupplierInvoice,
  Quote,
  Customer,
  Supplier,
  CategoryGroup,
} from "./pennylane-types";

// Nombre de mois clos utilisés pour le burn net moyen (spec: "3 à 6 derniers mois clos").
const BURN_AVERAGE_MONTHS = 6;
// Profondeur de l'historique affiché sur la courbe d'évolution mensuelle.
const HISTORY_MONTHS = 12;

function toNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function startOfMonthsAgo(months: number): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getBankAccounts(): Promise<BankAccount[]> {
  return fetchAllPages<BankAccount>("/bank_accounts");
}

// Trésorerie actuelle = somme des soldes des comptes en EUR.
// NB: les comptes dans une autre devise ne sont pas convertis (pas de taux fourni par
// l'endpoint bank_accounts) — ils sont exclus et signalés via `nonEurAccounts`.
export function computeTreasury(accounts: BankAccount[]): {
  total: number;
  nonEurAccounts: BankAccount[];
} {
  const eurAccounts = accounts.filter((a) => a.currency === "EUR");
  const nonEurAccounts = accounts.filter((a) => a.currency !== "EUR");
  const total = eurAccounts.reduce((sum, a) => sum + toNumber(a.balance), 0);
  return { total, nonEurAccounts };
}

export async function getTransactionsSince(sinceISO: string): Promise<Transaction[]> {
  // NB: l'endpoint /transactions n'accepte que le tri par "id" (pas "date"),
  // contrairement à ce que documente pennylane.readme.io. L'ordre n'a pas
  // d'importance ici puisque les transactions sont agrégées par mois ensuite.
  return fetchAllPages<Transaction>("/transactions", {
    filter: [{ field: "date", operator: "gteq", value: sinceISO }],
  });
}

interface MonthAgg {
  month: string; // "YYYY-MM"
  encaisse: number;
  depense: number;
}

// Agrège les transactions par mois. Convention: `amount` positif = encaissement,
// négatif = décaissement (à confirmer contre le compte sandbox, cf. tâche de vérification).
function aggregateByMonth(transactions: Transaction[]): Map<string, MonthAgg> {
  const map = new Map<string, MonthAgg>();
  for (const tx of transactions) {
    const key = monthKey(tx.date);
    const amount = toNumber(tx.amount);
    const agg = map.get(key) ?? { month: key, encaisse: 0, depense: 0 };
    if (amount >= 0) agg.encaisse += amount;
    else agg.depense += Math.abs(amount);
    map.set(key, agg);
  }
  return map;
}

export interface MonthlyPoint {
  month: string;
  encaisse: number;
  depense: number;
  burnNet: number;
  treasuryEnd: number;
}

export interface SummaryData {
  treasury: number;
  nonEurAccountsCount: number;
  mtdEncaisse: number;
  mtdDepense: number;
  burnNetMonth: number;
  avgBurnNet: number;
  runwayMonths: number | null; // null si trésorerie non décroissante
  monthly: MonthlyPoint[];
}

export async function computeSummary(): Promise<SummaryData> {
  const accounts = await getBankAccounts();
  const { total: treasury, nonEurAccounts } = computeTreasury(accounts);

  const since = startOfMonthsAgo(HISTORY_MONTHS);
  const transactions = await getTransactionsSince(isoDate(since));
  const byMonth = aggregateByMonth(transactions);

  const now = new Date();
  const currentMonthKey = now.toISOString().slice(0, 7);

  // Construit la liste des HISTORY_MONTHS derniers mois (du plus ancien au plus récent).
  const months: string[] = [];
  for (let i = HISTORY_MONTHS - 1; i >= 0; i--) {
    const d = startOfMonthsAgo(i);
    months.push(d.toISOString().slice(0, 7));
  }

  // Trésorerie de fin de mois reconstituée en remontant depuis la trésorerie actuelle
  // (hypothèse: aucun mouvement hors transactions bancaires — approximation raisonnable
  // pour une courbe indicative, cf. README).
  const treasuryEndByMonth = new Map<string, number>();
  let runningTreasury = treasury;
  for (let i = months.length - 1; i >= 0; i--) {
    const key = months[i];
    const agg = byMonth.get(key) ?? { month: key, encaisse: 0, depense: 0 };
    treasuryEndByMonth.set(key, runningTreasury);
    runningTreasury -= agg.encaisse - agg.depense;
  }

  const monthly: MonthlyPoint[] = months.map((key) => {
    const agg = byMonth.get(key) ?? { month: key, encaisse: 0, depense: 0 };
    return {
      month: key,
      encaisse: agg.encaisse,
      depense: agg.depense,
      burnNet: agg.encaisse - agg.depense,
      treasuryEnd: treasuryEndByMonth.get(key) ?? treasury,
    };
  });

  const currentMonth = monthly.find((m) => m.month === currentMonthKey);
  const mtdEncaisse = currentMonth?.encaisse ?? 0;
  const mtdDepense = currentMonth?.depense ?? 0;
  const burnNetMonth = mtdEncaisse - mtdDepense;

  // Mois clos = tous sauf le mois en cours, on prend les BURN_AVERAGE_MONTHS derniers.
  const closedMonths = monthly.filter((m) => m.month !== currentMonthKey);
  const lastClosed = closedMonths.slice(-BURN_AVERAGE_MONTHS);
  const avgBurnNet =
    lastClosed.length > 0
      ? lastClosed.reduce((sum, m) => sum + m.burnNet, 0) / lastClosed.length
      : 0;

  const runwayMonths = avgBurnNet < 0 ? treasury / Math.abs(avgBurnNet) : null;

  return {
    treasury,
    nonEurAccountsCount: nonEurAccounts.length,
    mtdEncaisse,
    mtdDepense,
    burnNetMonth,
    avgBurnNet,
    runwayMonths,
    monthly,
  };
}

async function buildNameMap(
  items: { id: number; name: string }[]
): Promise<Map<number, string>> {
  return new Map(items.map((i) => [i.id, i.name]));
}

export async function getCustomersMap(): Promise<Map<number, string>> {
  const customers = await fetchAllPages<Customer>("/customers");
  return buildNameMap(customers);
}

export async function getSuppliersMap(): Promise<Map<number, string>> {
  const suppliers = await fetchAllPages<Supplier>("/suppliers");
  return buildNameMap(suppliers);
}

export interface CustomerInvoiceRow {
  id: number;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  remainingAmount: number;
  deadline: string | null;
  ageDays: number | null; // jours écoulés depuis l'échéance (positif = en retard)
}

export async function getUnpaidCustomerInvoices(): Promise<{
  rows: CustomerInvoiceRow[];
  total: number;
}> {
  const [invoices, customers] = await Promise.all([
    fetchAllPages<CustomerInvoice>("/customer_invoices", {
      // NB: les filtres booléens de l'API Pennylane attendent la chaîne "false"/"true",
      // pas un booléen JSON — sinon 400 "Value \"false\" is not allowed".
      // Le tri par "date" n'est pas non plus accepté ici (cf. /transactions, /quotes),
      // on trie donc côté client si besoin.
      filter: [
        { field: "draft", operator: "eq", value: "false" },
        { field: "credit_note", operator: "eq", value: "false" },
      ],
    }),
    getCustomersMap(),
  ]);

  const unpaid = invoices.filter((inv) => !inv.paid);
  const today = new Date();

  const rows: CustomerInvoiceRow[] = unpaid.map((inv) => {
    const remaining = inv.remaining_amount_with_tax
      ? toNumber(inv.remaining_amount_with_tax)
      : toNumber(inv.amount);
    let ageDays: number | null = null;
    if (inv.deadline) {
      const diffMs = today.getTime() - new Date(inv.deadline).getTime();
      ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      customerName: inv.customer ? customers.get(inv.customer.id) ?? `Client #${inv.customer.id}` : "—",
      amount: toNumber(inv.amount),
      remainingAmount: remaining,
      deadline: inv.deadline,
      ageDays,
    };
  });

  const total = rows.reduce((sum, r) => sum + r.remainingAmount, 0);
  return { rows, total };
}

export interface SupplierInvoiceRow {
  id: number;
  invoiceNumber: string;
  supplierName: string;
  amount: number;
  remainingAmount: number;
  deadline: string | null;
}

export async function getUnpaidSupplierInvoices(): Promise<{
  rows: SupplierInvoiceRow[];
  total: number;
}> {
  const [invoices, suppliers] = await Promise.all([
    fetchAllPages<SupplierInvoice>("/supplier_invoices", {
      filter: [{ field: "payment_status", operator: "not_in", value: ["fully_paid", "paid_offline"] }],
    }),
    getSuppliersMap(),
  ]);

  const rows: SupplierInvoiceRow[] = invoices
    .filter((inv) => !inv.paid)
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      supplierName: inv.supplier ? suppliers.get(inv.supplier.id) ?? `Fournisseur #${inv.supplier.id}` : "—",
      amount: toNumber(inv.amount),
      // NB: contrairement à customer_invoices, remaining_amount_with_tax est négatif
      // sur les factures fournisseurs impayées côté sandbox (ex: "-4.58" pour une
      // facture de 4.58 €) — on prend la valeur absolue pour représenter le montant dû.
      remainingAmount: inv.remaining_amount_with_tax
        ? Math.abs(toNumber(inv.remaining_amount_with_tax))
        : toNumber(inv.amount),
      deadline: inv.deadline,
    }));

  const total = rows.reduce((sum, r) => sum + r.remainingAmount, 0);
  return { rows, total };
}

export interface QuoteRow {
  id: number;
  quoteNumber: string;
  customerName: string;
  amount: number;
  date: string | null;
  daysSinceSent: number | null;
}

export async function getPendingQuotes(): Promise<{ rows: QuoteRow[]; total: number }> {
  const [quotes, customers] = await Promise.all([
    fetchAllPages<Quote>("/quotes", {
      filter: [{ field: "status", operator: "eq", value: "pending" }],
    }),
    getCustomersMap(),
  ]);

  const today = new Date();
  const rows: QuoteRow[] = quotes.map((q) => {
    let daysSinceSent: number | null = null;
    if (q.date) {
      const diffMs = today.getTime() - new Date(q.date).getTime();
      daysSinceSent = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
    return {
      id: q.id,
      quoteNumber: q.quote_number,
      customerName: q.customer ? customers.get(q.customer.id) ?? `Client #${q.customer.id}` : "—",
      amount: toNumber(q.amount),
      date: q.date,
      daysSinceSent,
    };
  });

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return { rows, total };
}

const UNCATEGORIZED_LABEL = "Non catégorisé";
// Profondeur d'historique pour la ventilation des dépenses par catégorie.
const SPENDING_HISTORY_MONTHS = 12;

export interface SpendingCategoryRow {
  category: string;
  amount: number;
  transactionCount: number;
  share: number; // part du total, entre 0 et 1
}

export interface SpendingBreakdown {
  rows: SpendingCategoryRow[];
  total: number;
  expenseGroupFound: boolean;
  periodMonths: number;
}

// Trouve le groupe de catégories analytiques "Type de dépenses" (le libellé exact peut
// varier selon la configuration du compte Pennylane — recherche insensible à la casse
// et aux accents plutôt qu'un id fixe, qui diffère entre sandbox et production).
async function findExpenseCategoryGroup(): Promise<CategoryGroup | null> {
  const groups = await fetchAllPages<CategoryGroup>("/category_groups");
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  return (
    groups.find((g) => normalize(g.label).includes("type de depense")) ??
    groups.find((g) => normalize(g.label).includes("depense")) ??
    null
  );
}

export async function getSpendingByCategory(): Promise<SpendingBreakdown> {
  const expenseGroup = await findExpenseCategoryGroup();
  const since = startOfMonthsAgo(SPENDING_HISTORY_MONTHS - 1);
  const transactions = await getTransactionsSince(isoDate(since));

  const totals = new Map<string, { amount: number; count: number }>();

  function addToCategory(label: string, amount: number) {
    const entry = totals.get(label) ?? { amount: 0, count: 0 };
    entry.amount += amount;
    totals.set(label, entry);
  }

  for (const tx of transactions) {
    const amount = toNumber(tx.amount);
    if (amount >= 0) continue; // on ne ventile que les dépenses (montants négatifs)
    const spend = Math.abs(amount);

    const expenseCategories = expenseGroup
      ? tx.categories.filter((c) => c.category_group.id === expenseGroup.id)
      : [];

    if (expenseCategories.length === 0) {
      addToCategory(UNCATEGORIZED_LABEL, spend);
      const entry = totals.get(UNCATEGORIZED_LABEL)!;
      entry.count += 1;
      continue;
    }

    const weightSum = expenseCategories.reduce((s, c) => s + toNumber(c.weight), 0) || 1;
    for (const cat of expenseCategories) {
      const share = toNumber(cat.weight) / weightSum;
      addToCategory(cat.label, spend * share);
      const entry = totals.get(cat.label)!;
      entry.count += 1;
    }
  }

  const total = Array.from(totals.values()).reduce((sum, v) => sum + v.amount, 0);

  const rows: SpendingCategoryRow[] = Array.from(totals.entries())
    .map(([category, { amount, count }]) => ({
      category,
      amount,
      transactionCount: count,
      share: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    rows,
    total,
    expenseGroupFound: expenseGroup !== null,
    periodMonths: SPENDING_HISTORY_MONTHS,
  };
}
