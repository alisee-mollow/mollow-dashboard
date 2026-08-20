// Types basés sur la documentation publique Pennylane API v2 (pennylane.readme.io).
// À AJUSTER dès vérification contre le compte sandbox réel (voir README, section "Vérification").

export interface PaginatedResponse<T> {
  has_more: boolean;
  next_cursor: string | null;
  items: T[];
}

export interface Ref {
  id: number;
  url?: string;
}

export interface BankAccount {
  id: number;
  name: string;
  currency: string;
  balance: string; // decimal string, dans la devise du compte
  bank_establishment?: Ref;
}

export interface TransactionCategory {
  id: number;
  label: string;
  weight: string; // part de la transaction allouée à cette catégorie, ex. "1.0", "0.5"
  category_group: { id: number };
}

export interface Transaction {
  id: number;
  label: string | null;
  date: string; // YYYY-MM-DD
  amount: string; // en euros, signé : positif = entrée, négatif = sortie (confirmé en sandbox)
  currency_amount: string;
  currency: string | null;
  bank_account: Ref;
  categories: TransactionCategory[];
}

export interface CategoryGroup {
  id: number;
  label: string;
}

// Enum élargi après vérification sandbox : "upcoming", "incomplete" et "archived"
// observés en conditions réelles (non documentés par pennylane.readme.io).
// "incomplete" = document mal formé (parfois sans client rattaché) et "archived" =
// facture classée sans suite (ex. note de frais mal importée) : les deux ont
// `paid: false` sans être de vraies créances actives — voir ACTIVE_RECEIVABLE_STATUSES
// dans src/lib/finance.ts.
export type CustomerInvoiceStatus =
  | "paid"
  | "partially_paid"
  | "late"
  | "upcoming"
  | "incomplete"
  | "archived"
  | "draft"
  | "cancelled"
  | "credit_note";

export interface CustomerInvoice {
  id: number;
  invoice_number: string;
  label: string | null;
  amount: string;
  currency: string;
  paid: boolean;
  status: CustomerInvoiceStatus;
  deadline: string | null; // échéance
  date: string | null; // date d'émission
  draft: boolean;
  credit_note: boolean;
  remaining_amount_with_tax: string | null;
  customer: Ref | null;
}

export type QuoteStatus = "pending" | "accepted" | "denied" | "invoiced" | "expired";

export interface Quote {
  id: number;
  quote_number: string;
  label: string | null;
  amount: string;
  currency: string;
  status: QuoteStatus;
  date: string | null; // date d'émission / d'envoi
  deadline: string | null; // date de validité
  customer: Ref | null;
}

export interface Customer {
  id: number;
  name: string;
}

export interface Supplier {
  id: number;
  name: string;
}

// Champs minimaux utilisés pour le classement "Top fournisseurs" (src/lib/finance.ts,
// getTopSuppliers) — pas de suivi de paiement ici, seulement l'agrégation par montant.
export interface SupplierInvoiceSummary {
  id: number;
  amount: string;
  date: string | null;
  supplier: Ref | null;
}
