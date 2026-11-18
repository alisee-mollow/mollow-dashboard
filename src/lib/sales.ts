import "server-only";
import { fetchAllPages } from "./pennylane";
import { amountHT, currentYear, getCustomers, toNumber } from "./finance";
import { getHubSpotCompanies, getHubSpotOwners, type HubSpotCompany } from "./hubspot";
import type { Customer, CustomerInvoice, CustomerInvoiceStatus, Quote, QuoteStatus } from "./pennylane-types";
import type {
  SalesData,
  SalesInvoiceRow,
  SalesInvoiceStatus,
  SalesOwner,
  SalesQuoteRow,
  UnmatchedCustomer,
} from "./sales-types";

// Pennylane n'expose aucun champ "auteur" sur les devis et factures (vérifié sur
// tous les documents : ni created_by/user/owner, custom_fields toujours vides). Le
// commercial est donc déduit du client : chaque client Pennylane est rapproché d'une
// entreprise HubSpot, et ses documents sont attribués au propriétaire de cette
// entreprise (hubspot_owner_id). HubSpot ne stocke pas de SIREN, d'où un
// rapprochement par nom normalisé puis, à défaut, par domaine e-mail.

// Statuts de facture affichés (cf. demande) : les factures annulées, archivées ou
// incomplètes ne sont pas du chiffre d'affaires réel (cf. ACTIVE_RECEIVABLE_STATUSES
// dans finance.ts pour la même logique côté créances).
const BILLED_STATUSES = new Set<CustomerInvoiceStatus>(["paid", "upcoming", "late", "partially_paid"]);

// Formes juridiques ignorées pour comparer les noms ("ACME SAS" = "Acme").
const LEGAL_FORMS = new Set([
  "sa", "sas", "sasu", "sarl", "eurl", "sci", "snc", "scop", "scic", "selarl",
  "ltd", "limited", "inc", "llc", "gmbh", "bv", "srl", "spa", "ag",
]);

// Domaines de messagerie grand public : ne permettent pas d'identifier une entreprise.
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr",
  "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr", "icloud.com", "me.com",
  "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "laposte.net", "bbox.fr", "proton.me",
  "protonmail.com", "aol.com",
]);

export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token && !LEGAL_FORMS.has(token))
    .join(" ");
}

function normalizeDomain(domain: string | null | undefined): string {
  if (!domain) return "";
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function emailDomains(customer: Customer): string[] {
  return (customer.emails ?? [])
    .map((email) => normalizeDomain(email.split("@")[1]))
    .filter((d) => d && !GENERIC_EMAIL_DOMAINS.has(d));
}

interface Attribution {
  ownerId: string | null;
  hubspotCompanyId: string | null;
  reason: UnmatchedCustomer["reason"] | null;
}

function indexBy(companies: HubSpotCompany[], key: (c: HubSpotCompany) => string): Map<string, HubSpotCompany[]> {
  const map = new Map<string, HubSpotCompany[]>();
  for (const company of companies) {
    const k = key(company);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), company]);
  }
  return map;
}

// Rapproche chaque client Pennylane d'une entreprise HubSpot. Si plusieurs
// entreprises correspondent avec des propriétaires différents, le client reste
// non attribué (signalé comme ambigu) plutôt que d'être attribué au hasard.
export function attributeCustomers(
  customers: Customer[],
  companies: HubSpotCompany[]
): Map<number, Attribution> {
  const byName = indexBy(companies, (c) => normalizeCompanyName(c.properties.name));
  const byDomain = indexBy(companies, (c) => normalizeDomain(c.properties.domain));

  const result = new Map<number, Attribution>();
  for (const customer of customers) {
    let matches = byName.get(normalizeCompanyName(customer.name)) ?? [];
    if (matches.length === 0) {
      matches = Array.from(new Set(emailDomains(customer).flatMap((d) => byDomain.get(d) ?? [])));
    }

    if (matches.length === 0) {
      result.set(customer.id, { ownerId: null, hubspotCompanyId: null, reason: "no_match" });
      continue;
    }

    const owned = matches.filter((c) => c.properties.hubspot_owner_id);
    const ownerIds = new Set(owned.map((c) => c.properties.hubspot_owner_id as string));
    if (ownerIds.size === 0) {
      result.set(customer.id, { ownerId: null, hubspotCompanyId: matches[0].id, reason: "no_owner" });
    } else if (ownerIds.size > 1) {
      result.set(customer.id, { ownerId: null, hubspotCompanyId: null, reason: "ambiguous" });
    } else {
      result.set(customer.id, { ownerId: [...ownerIds][0], hubspotCompanyId: owned[0].id, reason: null });
    }
  }
  return result;
}

function inYear(date: string | null, year: number): boolean {
  return !!date && date.startsWith(`${year}-`);
}

export async function getSalesData(year: number): Promise<SalesData> {
  const displayYear = Math.min(year, currentYear());

  // Toutes les factures (toutes années) sont nécessaires pour savoir si un devis de
  // l'année a été transformé, même si sa facture a été émise l'année suivante. Le
  // filtre par date des devis est fait ici plutôt que côté API (le tri/filtre par
  // date n'est pas fiable sur /quotes, cf. README).
  const [quotes, invoices, customers, owners, companies] = await Promise.all([
    fetchAllPages<Quote>("/quotes"),
    fetchAllPages<CustomerInvoice>("/customer_invoices", {
      filter: [
        { field: "draft", operator: "eq", value: "false" },
        { field: "credit_note", operator: "eq", value: "false" },
      ],
    }),
    getCustomers(),
    getHubSpotOwners(),
    getHubSpotCompanies(),
  ]);

  const attribution = attributeCustomers(customers, companies);
  const customerNames = new Map(customers.map((c) => [c.id, c.name]));
  const quoteNumbers = new Map(quotes.map((q) => [q.id, q.quote_number]));

  const customerInfo = (ref: { id: number } | null) => {
    if (!ref) return { customerName: "—", ownerId: null, hubspotCompanyId: null };
    const a = attribution.get(ref.id);
    return {
      customerName: customerNames.get(ref.id) ?? `Client #${ref.id}`,
      ownerId: a?.ownerId ?? null,
      hubspotCompanyId: a?.hubspotCompanyId ?? null,
    };
  };

  const billedInvoices = invoices.filter((inv) => BILLED_STATUSES.has(inv.status));
  const invoicedQuoteIds = new Set(billedInvoices.map((inv) => inv.quote?.id).filter((id): id is number => !!id));

  const quoteRows: SalesQuoteRow[] = quotes
    .filter((q) => inYear(q.date, displayYear))
    .map((q) => ({
      id: q.id,
      quoteNumber: q.quote_number,
      ...customerInfo(q.customer),
      date: q.date,
      deadline: q.deadline,
      amountHT: amountHT(q),
      status: q.status as QuoteStatus,
      invoiced: q.status === "invoiced" || invoicedQuoteIds.has(q.id),
    }));

  const invoiceRows: SalesInvoiceRow[] = billedInvoices
    .filter((inv) => inYear(inv.date, displayYear))
    .map((inv) => {
      const ht = amountHT(inv);
      return {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        ...customerInfo(inv.customer),
        date: inv.date,
        deadline: inv.deadline,
        amountHT: ht,
        // remaining_amount_without_tax vérifié cohérent : = HT si impayée, 0 si payée.
        collectedHT: ht - toNumber(inv.remaining_amount_without_tax),
        status: inv.status as SalesInvoiceStatus,
        quoteId: inv.quote?.id ?? null,
        quoteNumber: inv.quote ? quoteNumbers.get(inv.quote.id) ?? null : null,
      };
    });

  // Clients non attribués ayant au moins un document sur l'année : liste à corriger
  // dans HubSpot (nom, domaine ou propriétaire de l'entreprise).
  const usedCustomerIds = new Set(
    [...quotes.filter((q) => inYear(q.date, displayYear)), ...billedInvoices.filter((i) => inYear(i.date, displayYear))]
      .map((d) => d.customer?.id)
      .filter((id): id is number => !!id)
  );
  const unmatchedCustomers: UnmatchedCustomer[] = [];
  for (const id of usedCustomerIds) {
    // Tout client est présent dans `attribution` ; `reason` est null s'il est rattaché.
    const reason = attribution.get(id)?.reason;
    if (reason) unmatchedCustomers.push({ id, name: customerNames.get(id) ?? `Client #${id}`, reason });
  }
  unmatchedCustomers.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const salesOwners: SalesOwner[] = owners
    .filter((o) => !o.archived)
    .map((o) => ({
      id: o.id,
      name: [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || `Commercial #${o.id}`,
      firstName: o.firstName,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return {
    year: displayYear,
    owners: salesOwners,
    quotes: quoteRows,
    invoices: invoiceRows,
    unmatchedCustomers,
  };
}
