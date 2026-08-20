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

// Enum élargi après vérification sandbox : "upcoming" observé en conditions réelles
// (non documenté par pennylane.readme.io). Le code ne filtre pas sur ce champ,
// uniquement sur `paid` + `draft`/`credit_note`, donc reste robuste aux valeurs
// non listées ici.
export type CustomerInvoiceStatus =
  | "paid"
  | "partially_paid"
  | "late"
  | "upcoming"
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

export type SupplierInvoicePaymentStatus =
  | "to_be_processed"
  | "to_be_paid"
  | "partially_paid"
  | "payment_error"
  | "payment_scheduled"
  | "payment_in_progress"
  | "payment_emitted"
  | "payment_found"
  | "paid_offline"
  | "fully_paid";

export interface SupplierInvoice {
  id: number;
  invoice_number: string;
  label: string | null;
  amount: string;
  currency: string;
  paid: boolean;
  payment_status: SupplierInvoicePaymentStatus;
  deadline: string | null;
  date: string | null;
  remaining_amount_with_tax: string | null;
  supplier: Ref | null;
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
