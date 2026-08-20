import "server-only";
import { fetchAllPages, type Filter } from "./pennylane";
import type {
  BankAccount,
  Transaction,
  CustomerInvoice,
  Quote,
  Customer,
  Supplier,
  SupplierInvoiceSummary,
  CategoryGroup,
} from "./pennylane-types";

// Nombre de mois clos utilisés pour le burn net moyen (spec: "3 à 6 derniers mois clos").
const BURN_AVERAGE_MONTHS = 6;
// Horizon maximal de la projection de trésorerie affichée sur la courbe.
const MAX_PROJECTION_MONTHS = 12;

function toNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function currentYear(): number {
  return new Date().getUTCFullYear();
}

// Lit le paramètre `?year=` d'une URL de requête, avec repli sur l'année en cours.
export function parseYear(url: string): number {
  const year = Number(new URL(url).searchParams.get("year"));
  return Number.isInteger(year) && year > 2000 ? year : currentYear();
}

function startOfYear(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

// Ajoute `n` mois (positif ou négatif) à une clé "YYYY-MM".
function addMonths(key: string, n: number): string {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + n, 1));
  return d.toISOString().slice(0, 7);
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

// Virements entre comptes bancaires Mollow (ex. alimentation du compte Pennylane
// depuis le compte principal, ouverture du compte La Nef) : ce ne sont pas des
// revenus/dépenses mais de simples déplacements d'argent en interne. Détecté par
// libellé — validé en confrontant tous les libellés à un scan de paires
// montant/date identiques sur deux comptes différents (voir historique du commit) :
// tous les libellés matchant "recharge compte" ou "ouverture compte" faisaient
// partie d'une paire symétrique, aucun faux positif trouvé sur ~1600 transactions.
function isInternalTransfer(label: string | null): boolean {
  if (!label) return false;
  const normalized = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return normalized.includes("recharge compte") || normalized.includes("ouverture compte");
}

export async function getTransactionsInRange(
  sinceISO: string,
  untilISO?: string
): Promise<Transaction[]> {
  // NB: l'endpoint /transactions n'accepte que le tri par "id" (pas "date"),
  // contrairement à ce que documente pennylane.readme.io. L'ordre n'a pas
  // d'importance ici puisque les transactions sont agrégées par mois ensuite.
  const filter: Filter[] = [{ field: "date", operator: "gteq", value: sinceISO }];
  if (untilISO) filter.push({ field: "date", operator: "lteq", value: untilISO });
  const transactions = await fetchAllPages<Transaction>("/transactions", { filter });
  return transactions.filter((tx) => !isInternalTransfer(tx.label));
}

interface MonthAgg {
  month: string; // "YYYY-MM"
  encaisse: number;
  depense: number;
}

// Agrège les transactions par mois. Convention: `amount` positif = encaissement,
// négatif = décaissement (confirmé contre le compte sandbox, cf. README).
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

export interface ProjectedPoint {
  month: string;
  treasuryEnd: number;
}

export interface SummaryData {
  treasury: number;
  nonEurAccountsCount: number;
  mtdEncaisse: number;
  mtdDepense: number;
  burnNetMonth: number;
  avgBurnNet: number;
  avgMonthlyDepense: number; // dépense brute moyenne (6 derniers mois clos)
  monthsOfTreasury: number | null; // trésorerie / avgMonthlyDepense ; null si aucune dépense
  ytdAvgMonthlyDepense: number; // dépense moyenne mensuelle depuis le 1er janvier de l'année en cours
  year: number;
  monthly: MonthlyPoint[]; // les mois de `year` (Jan → mois courant si year = année en cours)
  previousYearMonthly: MonthlyPoint[]; // mêmes mois, année `year - 1`, pour comparaison
  projection: ProjectedPoint[]; // suite de `monthly` si year = année en cours, sinon vide
}

// Les KPI (trésorerie, burn, mois de trésorerie, dépense moyenne YTD) reflètent
// toujours l'état réel actuel, indépendamment de l'année affichée dans les
// graphiques — seuls `monthly`, `previousYearMonthly` et `projection` changent
// avec `year`.
export async function computeSummary(year: number): Promise<SummaryData> {
  const accounts = await getBankAccounts();
  const { total: treasury, nonEurAccounts } = computeTreasury(accounts);

  const displayYear = Math.min(year, currentYear());
  const since = startOfYear(displayYear);
  // On récupère toujours jusqu'à aujourd'hui, même pour une année passée : la
  // reconstitution de la trésorerie de fin de mois remonte depuis la trésorerie
  // actuelle et a donc besoin de tous les mois entre `since` et maintenant.
  const [transactions, previousYearTransactions] = await Promise.all([
    getTransactionsInRange(isoDate(since)),
    getTransactionsInRange(isoDate(startOfYear(displayYear - 1)), isoDate(new Date(Date.UTC(displayYear - 1, 11, 31)))),
  ]);
  const byMonth = aggregateByMonth(transactions);
  const previousYearByMonth = aggregateByMonth(previousYearTransactions);

  const nowKey = currentMonthKey();

  // Tous les mois entre `since` et le mois courant (inclus), du plus ancien au plus récent.
  const fullMonths: string[] = [];
  for (let key = since.toISOString().slice(0, 7); key <= nowKey; key = addMonths(key, 1)) {
    fullMonths.push(key);
  }

  // Trésorerie de fin de mois reconstituée en remontant depuis la trésorerie actuelle
  // (hypothèse : aucun mouvement hors transactions bancaires — approximation
  // raisonnable pour une courbe indicative, cf. README).
  const treasuryEndByMonth = new Map<string, number>();
  let runningTreasury = treasury;
  for (let i = fullMonths.length - 1; i >= 0; i--) {
    const key = fullMonths[i];
    const agg = byMonth.get(key) ?? { month: key, encaisse: 0, depense: 0 };
    treasuryEndByMonth.set(key, runningTreasury);
    runningTreasury -= agg.encaisse - agg.depense;
  }

  const toPoint = (key: string): MonthlyPoint => {
    const agg = byMonth.get(key) ?? { month: key, encaisse: 0, depense: 0 };
    return {
      month: key,
      encaisse: agg.encaisse,
      depense: agg.depense,
      burnNet: agg.encaisse - agg.depense,
      treasuryEnd: treasuryEndByMonth.get(key) ?? treasury,
    };
  };

  const toPreviousYearPoint = (key: string): MonthlyPoint => {
    const agg = previousYearByMonth.get(key) ?? { month: key, encaisse: 0, depense: 0 };
    return { month: key, encaisse: agg.encaisse, depense: agg.depense, burnNet: agg.encaisse - agg.depense, treasuryEnd: 0 };
  };

  const monthly = fullMonths.filter((key) => key.startsWith(String(displayYear))).map(toPoint);
  const previousYearMonthly = monthly.map((m) => toPreviousYearPoint(addMonths(m.month, -12)));

  // KPI "en direct" : basés sur le mois courant réel, pas sur `year`.
  const currentPoint = toPoint(nowKey);
  const mtdEncaisse = currentPoint.encaisse;
  const mtdDepense = currentPoint.depense;
  const burnNetMonth = currentPoint.burnNet;

  const closedMonths = fullMonths.filter((k) => k !== nowKey).map(toPoint);
  const lastClosed = closedMonths.slice(-BURN_AVERAGE_MONTHS);
  const avgBurnNet =
    lastClosed.length > 0 ? lastClosed.reduce((sum, m) => sum + m.burnNet, 0) / lastClosed.length : 0;
  const avgMonthlyDepense =
    lastClosed.length > 0 ? lastClosed.reduce((sum, m) => sum + m.depense, 0) / lastClosed.length : 0;

  // "Mois de trésorerie disponible" : combien de mois la trésorerie actuelle
  // couvrirait au rythme de dépense moyen observé, sans compter sur aucune rentrée
  // d'argent — volontairement plus conservateur que l'ancien "runway" (qui se
  // basait sur le burn NET et pouvait devenir "N/A" dès que les entrées dépassaient
  // les sorties sur la période, ce qui manquait de lisibilité).
  const monthsOfTreasury = avgMonthlyDepense > 0 ? treasury / avgMonthlyDepense : null;

  // Dépense moyenne mensuelle depuis le 1er janvier de l'année RÉELLE en cours
  // (indépendant de `year`) : la fenêtre récupérée démarre toujours au plus tôt à
  // startOfYear(displayYear) ; si year < currentYear, on doit encore isoler les mois
  // de l'année réelle dans `fullMonths` (ils y sont bien, puisque fullMonths va
  // jusqu'à maintenant quel que soit `year`).
  const ytdMonths = fullMonths.filter((k) => k.startsWith(String(currentYear()))).map(toPoint);
  const ytdAvgMonthlyDepense =
    ytdMonths.length > 0 ? ytdMonths.reduce((sum, m) => sum + m.depense, 0) / ytdMonths.length : 0;

  // Projection : uniquement quand on affiche l'année en cours, en prolongeant après
  // le mois courant au rythme du burn net moyen, jusqu'à extinction (ou 12 mois max).
  const projection: ProjectedPoint[] = [];
  if (displayYear === currentYear()) {
    const horizon =
      avgBurnNet < 0
        ? Math.min(MAX_PROJECTION_MONTHS, Math.ceil(treasury / Math.abs(avgBurnNet)) + 1)
        : 6;
    let key = nowKey;
    let value = currentPoint.treasuryEnd;
    for (let i = 0; i < horizon; i++) {
      key = addMonths(key, 1);
      value += avgBurnNet;
      projection.push({ month: key, treasuryEnd: value });
      if (value <= 0) break;
    }
  }

  return {
    treasury,
    nonEurAccountsCount: nonEurAccounts.length,
    mtdEncaisse,
    mtdDepense,
    burnNetMonth,
    avgBurnNet,
    avgMonthlyDepense,
    monthsOfTreasury,
    ytdAvgMonthlyDepense,
    year: displayYear,
    monthly,
    previousYearMonthly,
    projection,
  };
}

async function buildNameMap(items: { id: number; name: string }[]): Promise<Map<number, string>> {
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

// Statuts considérés comme de vraies créances actives. Exclut notamment "archived"
// (factures classées sans suite, ex. notes de frais mal importées) et "incomplete"
// (documents mal formés, parfois sans client rattaché) qui ont `paid: false` sans
// être de vraies factures en attente de paiement — vérifié en conditions réelles
// contre le sandbox Mollow (ex. facture "WIT", "Département de la Mayenne").
const ACTIVE_RECEIVABLE_STATUSES = new Set(["upcoming", "late", "partially_paid"]);

export async function getUnpaidCustomerInvoices(): Promise<{
  rows: CustomerInvoiceRow[];
  total: number;
}> {
  const [invoices, customers] = await Promise.all([
    fetchAllPages<CustomerInvoice>("/customer_invoices", {
      // NB: les filtres booléens de l'API Pennylane attendent la chaîne "false"/"true",
      // pas un booléen JSON — sinon 400 "Value \"false\" is not allowed".
      filter: [
        { field: "draft", operator: "eq", value: "false" },
        { field: "credit_note", operator: "eq", value: "false" },
      ],
    }),
    getCustomersMap(),
  ]);

  const active = invoices.filter((inv) => !inv.paid && ACTIVE_RECEIVABLE_STATUSES.has(inv.status));
  const today = new Date();

  const rows: CustomerInvoiceRow[] = active.map((inv) => {
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

export interface QuoteRow {
  id: number;
  quoteNumber: string;
  customerName: string;
  amount: number;
  status: "pending" | "expired";
  date: string | null;
  daysSinceSent: number | null;
}

// Devis "non acceptés" au sens large : encore en attente de réponse (pending) ou
// arrivés à expiration sans réponse (expired) — sur demande, "expired" est inclus
// puisqu'un devis expiré reste un devis envoyé et non accepté.
export async function getOpenQuotes(): Promise<{ rows: QuoteRow[]; total: number }> {
  const [quotes, customers] = await Promise.all([
    fetchAllPages<Quote>("/quotes", {
      filter: [{ field: "status", operator: "in", value: ["pending", "expired"] }],
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
      status: q.status as "pending" | "expired",
      date: q.date,
      daysSinceSent,
    };
  });

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return { rows, total };
}

export interface AcceptedQuoteRow {
  id: number;
  quoteNumber: string;
  customerName: string;
  quoteAmount: number;
  invoicedAmount: number;
  remainingAmount: number;
  date: string | null;
}

export interface AcceptedQuotesResult {
  rows: AcceptedQuoteRow[];
  totalRemaining: number;
}

// Devis acceptés mais pas (entièrement) facturés : pour chacun, on récupère les
// factures clients déjà émises contre ce devis (`quote_id`) afin de calculer le
// montant restant à facturer — plusieurs devis Mollow sont facturés en plusieurs
// fois (ex. acompte + solde), le montant du devis seul surestimerait la trésorerie
// à venir si on l'utilisait tel quel.
export async function getUnbilledAcceptedQuotes(): Promise<AcceptedQuotesResult> {
  const [quotes, customers] = await Promise.all([
    fetchAllPages<Quote>("/quotes", {
      filter: [{ field: "status", operator: "eq", value: "accepted" }],
    }),
    getCustomersMap(),
  ]);

  const rows = await Promise.all(
    quotes.map(async (q) => {
      const linkedInvoices = await fetchAllPages<CustomerInvoice>("/customer_invoices", {
        filter: [
          { field: "quote_id", operator: "eq", value: q.id },
          { field: "draft", operator: "eq", value: "false" },
          { field: "credit_note", operator: "eq", value: "false" },
        ],
      });
      const invoicedAmount = linkedInvoices.reduce((sum, inv) => sum + toNumber(inv.amount), 0);
      const quoteAmount = toNumber(q.amount);
      const row: AcceptedQuoteRow = {
        id: q.id,
        quoteNumber: q.quote_number,
        customerName: q.customer ? customers.get(q.customer.id) ?? `Client #${q.customer.id}` : "—",
        quoteAmount,
        invoicedAmount,
        remainingAmount: Math.max(0, quoteAmount - invoicedAmount),
        date: q.date,
      };
      return row;
    })
  );

  const filtered = rows.filter((r) => r.remainingAmount > 0.01).sort((a, b) => b.remainingAmount - a.remainingAmount);
  const totalRemaining = filtered.reduce((sum, r) => sum + r.remainingAmount, 0);
  return { rows: filtered, totalRemaining };
}

const UNCATEGORIZED_LABEL = "Non catégorisé";

export interface CategoryRow {
  category: string;
  amount: number;
  transactionCount: number;
  share: number; // part du total, entre 0 et 1
}

export interface UncategorizedTransaction {
  id: number;
  date: string;
  label: string | null;
  amount: number;
}

export interface CategoryBreakdown {
  rows: CategoryRow[];
  total: number;
  groupFound: boolean;
  year: number;
  uncategorized: UncategorizedTransaction[];
  previousYearTotal: number; // même période (YTD si année en cours), année précédente
}

// Somme des transactions d'un sens donné entre `since` (1er janvier de `year`) et
// `until`, sans ventilation par catégorie — sert uniquement à la comparaison
// YTD / année précédente.
async function getPeriodTotal(direction: "expense" | "revenue", year: number, until: Date): Promise<number> {
  const transactions = await getTransactionsInRange(isoDate(startOfYear(year)), isoDate(until));
  return transactions.reduce((sum, tx) => {
    const amount = toNumber(tx.amount);
    if (direction === "expense" && amount < 0) return sum + Math.abs(amount);
    if (direction === "revenue" && amount > 0) return sum + amount;
    return sum;
  }, 0);
}

// Trouve un groupe de catégories analytiques Pennylane par mot-clé dans son libellé
// (recherche insensible à la casse et aux accents plutôt qu'un id fixe, qui diffère
// entre sandbox et production).
async function findCategoryGroup(keyword: string): Promise<CategoryGroup | null> {
  const groups = await fetchAllPages<CategoryGroup>("/category_groups");
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const target = normalize(keyword);
  return (
    groups.find((g) => normalize(g.label).includes(`type de ${target}`)) ??
    groups.find((g) => normalize(g.label).includes(target)) ??
    null
  );
}

// Ventile les transactions d'un sens donné (dépense = montants négatifs, revenu =
// montants positifs) par catégorie analytique d'un groupe donné, sur une année civile.
// Une transaction peut porter plusieurs catégories du même groupe avec un poids
// chacune (ex. 0.5 / 0.5) : le montant est réparti au prorata. Sans catégorie de ce
// groupe, la transaction tombe dans "Non catégorisé" (liste exposée pour aller la
// catégoriser dans Pennylane).
async function getBreakdownByCategory(
  groupKeyword: string,
  direction: "expense" | "revenue",
  year: number
): Promise<CategoryBreakdown> {
  const displayYear = Math.min(year, currentYear());
  const since = startOfYear(displayYear);
  const until = new Date(Date.UTC(displayYear, 11, 31));
  const now = new Date();
  // Comparaison "à période comparable" : si on affiche l'année en cours (donc
  // partielle, YTD), on borne l'année précédente au même jour ; sinon (année
  // passée complète) on compare à l'année précédente complète elle aussi.
  const comparisonCutoff =
    displayYear === currentYear()
      ? new Date(Date.UTC(displayYear - 1, now.getUTCMonth(), now.getUTCDate()))
      : new Date(Date.UTC(displayYear - 1, 11, 31));
  const [group, transactions, previousYearTotal] = await Promise.all([
    findCategoryGroup(groupKeyword),
    getTransactionsInRange(isoDate(since), isoDate(until)),
    getPeriodTotal(direction, displayYear - 1, comparisonCutoff),
  ]);

  const totals = new Map<string, { amount: number; count: number }>();
  const uncategorized: UncategorizedTransaction[] = [];

  function addToCategory(label: string, amount: number) {
    const entry = totals.get(label) ?? { amount: 0, count: 0 };
    entry.amount += amount;
    entry.count += 1;
    totals.set(label, entry);
  }

  for (const tx of transactions) {
    const amount = toNumber(tx.amount);
    if (direction === "expense" && amount >= 0) continue;
    if (direction === "revenue" && amount <= 0) continue;
    const value = Math.abs(amount);

    const matchingCategories = group ? tx.categories.filter((c) => c.category_group.id === group.id) : [];

    if (matchingCategories.length === 0) {
      addToCategory(UNCATEGORIZED_LABEL, value);
      uncategorized.push({ id: tx.id, date: tx.date, label: tx.label, amount: value });
      continue;
    }

    const weightSum = matchingCategories.reduce((s, c) => s + toNumber(c.weight), 0) || 1;
    for (const cat of matchingCategories) {
      const share = toNumber(cat.weight) / weightSum;
      addToCategory(cat.label, value * share);
    }
  }

  const total = Array.from(totals.values()).reduce((sum, v) => sum + v.amount, 0);

  const rows: CategoryRow[] = Array.from(totals.entries())
    .map(([category, { amount, count }]) => ({
      category,
      amount,
      transactionCount: count,
      share: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  uncategorized.sort((a, b) => b.amount - a.amount);

  return { rows, total, groupFound: group !== null, year: displayYear, uncategorized, previousYearTotal };
}

export async function getSpendingByCategory(year: number): Promise<CategoryBreakdown> {
  return getBreakdownByCategory("depense", "expense", year);
}

export async function getRevenueByCategory(year: number): Promise<CategoryBreakdown> {
  return getBreakdownByCategory("revenu", "revenue", year);
}

export interface TopCustomerRow {
  customerName: string;
  amount: number;
  invoiceCount: number;
  share: number;
}

export interface TopCustomersResult {
  rows: TopCustomerRow[];
  total: number;
  year: number;
}

// Top clients par total facturé (payé + en attente, hors brouillons et avoirs) sur
// l'année civile — reflète le volume d'affaires, pas seulement l'encaissé.
export async function getTopCustomers(year: number): Promise<TopCustomersResult> {
  const displayYear = Math.min(year, currentYear());
  const since = startOfYear(displayYear);
  const until = new Date(Date.UTC(displayYear, 11, 31));

  const [invoices, customers] = await Promise.all([
    fetchAllPages<CustomerInvoice>("/customer_invoices", {
      filter: [
        { field: "date", operator: "gteq", value: isoDate(since) },
        { field: "date", operator: "lteq", value: isoDate(until) },
        { field: "draft", operator: "eq", value: "false" },
        { field: "credit_note", operator: "eq", value: "false" },
      ],
    }),
    getCustomersMap(),
  ]);

  const totals = new Map<string, { amount: number; count: number }>();
  for (const inv of invoices) {
    const name = inv.customer ? customers.get(inv.customer.id) ?? `Client #${inv.customer.id}` : "—";
    const entry = totals.get(name) ?? { amount: 0, count: 0 };
    entry.amount += toNumber(inv.amount);
    entry.count += 1;
    totals.set(name, entry);
  }

  const total = Array.from(totals.values()).reduce((sum, v) => sum + v.amount, 0);

  const rows: TopCustomerRow[] = Array.from(totals.entries())
    .map(([customerName, { amount, count }]) => ({
      customerName,
      amount,
      invoiceCount: count,
      share: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { rows, total, year: displayYear };
}

export interface TopSupplierRow {
  supplierName: string;
  amount: number;
  invoiceCount: number;
  share: number;
}

export interface TopSuppliersResult {
  rows: TopSupplierRow[];
  total: number;
  year: number;
}

// Top fournisseurs par total facturé sur l'année civile (toutes factures fournisseurs
// de la période, indépendamment du statut de paiement) — donne une vision détaillée
// des dépenses par fournisseur (SNCF, Bubble, Adobe…) en complément de la ventilation
// par catégorie analytique.
export async function getTopSuppliers(year: number): Promise<TopSuppliersResult> {
  const displayYear = Math.min(year, currentYear());
  const since = startOfYear(displayYear);
  const until = new Date(Date.UTC(displayYear, 11, 31));

  const [invoices, suppliers] = await Promise.all([
    fetchAllPages<SupplierInvoiceSummary>("/supplier_invoices", {
      filter: [
        { field: "date", operator: "gteq", value: isoDate(since) },
        { field: "date", operator: "lteq", value: isoDate(until) },
      ],
    }),
    getSuppliersMap(),
  ]);

  const totals = new Map<string, { amount: number; count: number }>();
  for (const inv of invoices) {
    const name = inv.supplier ? suppliers.get(inv.supplier.id) ?? `Fournisseur #${inv.supplier.id}` : "—";
    const entry = totals.get(name) ?? { amount: 0, count: 0 };
    entry.amount += toNumber(inv.amount);
    entry.count += 1;
    totals.set(name, entry);
  }

  const total = Array.from(totals.values()).reduce((sum, v) => sum + v.amount, 0);

  const rows: TopSupplierRow[] = Array.from(totals.entries())
    .map(([supplierName, { amount, count }]) => ({
      supplierName,
      amount,
      invoiceCount: count,
      share: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { rows, total, year: displayYear };
}

export interface MonthlyCaPoint {
  month: string;
  ca: number;
}

export interface AccrualRevenueData {
  year: number;
  total: number; // TTC
  totalHT: number;
  previousYearTotal: number; // même période (YTD si année en cours), année précédente, TTC
  previousYearTotalHT: number;
  avgMonthlyCa: number;
  monthly: MonthlyCaPoint[];
  previousYearMonthly: MonthlyCaPoint[]; // mêmes mois, année `year - 1`
}

// Chiffre d'affaires "facturé" (comptabilité d'engagement) : basé sur la date
// d'émission des factures clients, pas sur les encaissements bancaires — volontairement
// découplé de la trésorerie (`/revenus` est en cash, cette page est en facturation).
// Les avoirs (credit_note) sont inclus avec leur montant négatif, ce qui les
// déduit naturellement du total plutôt que de les ignorer.
export async function getAccrualRevenue(year: number): Promise<AccrualRevenueData> {
  const displayYear = Math.min(year, currentYear());
  const since = startOfYear(displayYear);
  const until = new Date(Date.UTC(displayYear, 11, 31));
  const now = new Date();
  const comparisonCutoff =
    displayYear === currentYear()
      ? new Date(Date.UTC(displayYear - 1, now.getUTCMonth(), now.getUTCDate()))
      : new Date(Date.UTC(displayYear - 1, 11, 31));

  const fetchInvoices = (fromDate: Date, toDate: Date) =>
    fetchAllPages<CustomerInvoice>("/customer_invoices", {
      filter: [
        { field: "date", operator: "gteq", value: isoDate(fromDate) },
        { field: "date", operator: "lteq", value: isoDate(toDate) },
        { field: "draft", operator: "eq", value: "false" },
      ],
    });

  const [invoices, previousYearInvoices] = await Promise.all([
    fetchInvoices(since, until),
    fetchInvoices(startOfYear(displayYear - 1), comparisonCutoff),
  ]);

  function aggregateCaByMonth(invs: CustomerInvoice[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const inv of invs) {
      if (!inv.date) continue;
      const key = monthKey(inv.date);
      map.set(key, (map.get(key) ?? 0) + toNumber(inv.amount));
    }
    return map;
  }

  // HT = amount - tax, tous deux confirmés en euros (contrairement à
  // currency_amount_before_tax, qui reste dans la devise de la facture).
  function sumHT(invs: CustomerInvoice[]): number {
    return invs.reduce((sum, inv) => sum + (toNumber(inv.amount) - toNumber(inv.tax)), 0);
  }

  const byMonth = aggregateCaByMonth(invoices);
  const previousYearByMonth = aggregateCaByMonth(previousYearInvoices);

  // Le comparateur lexicographique "YYYY-MM" fonctionne directement : pour une
  // année passée, la borne `key <= currentMonthKey()` est toujours vraie jusqu'à
  // décembre ; pour l'année en cours, elle s'arrête naturellement au mois courant.
  const months: string[] = [];
  for (let key = `${displayYear}-01`; key <= `${displayYear}-12` && key <= currentMonthKey(); key = addMonths(key, 1)) {
    months.push(key);
  }

  const monthly: MonthlyCaPoint[] = months.map((key) => ({ month: key, ca: byMonth.get(key) ?? 0 }));
  const previousYearMonthly: MonthlyCaPoint[] = months.map((key) => {
    const prevKey = addMonths(key, -12);
    return { month: prevKey, ca: previousYearByMonth.get(prevKey) ?? 0 };
  });

  const total = monthly.reduce((sum, m) => sum + m.ca, 0);
  const previousYearTotal = previousYearMonthly.reduce((sum, m) => sum + m.ca, 0);
  const avgMonthlyCa = monthly.length > 0 ? total / monthly.length : 0;
  const totalHT = sumHT(invoices);
  const previousYearTotalHT = sumHT(previousYearInvoices);

  return {
    year: displayYear,
    total,
    totalHT,
    previousYearTotal,
    previousYearTotalHT,
    avgMonthlyCa,
    monthly,
    previousYearMonthly,
  };
}
