import "server-only";
import type { PaginatedResponse } from "./pennylane-types";

const BASE_URL = "https://app.pennylane.com/api/external/v2";

export class PennylaneApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "PennylaneApiError";
  }
}

function getToken(): string {
  const token = process.env.PENNYLANE_API_TOKEN;
  if (!token) {
    throw new PennylaneApiError(
      500,
      "PENNYLANE_API_TOKEN manquant. Renseigne-le dans .env.local (voir .env.local.example)."
    );
  }
  return token;
}

type FilterOp =
  | "eq"
  | "not_eq"
  | "gt"
  | "gteq"
  | "lt"
  | "lteq"
  | "in"
  | "not_in";

export interface Filter {
  field: string;
  operator: FilterOp;
  value: string | number | boolean | (string | number)[];
}

async function pennylaneFetch<T>(
  path: string,
  params: { filter?: Filter[]; sort?: string; cursor?: string; limit?: number } = {}
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params.filter && params.filter.length > 0) {
    url.searchParams.set("filter", JSON.stringify(params.filter));
  }
  if (params.sort) url.searchParams.set("sort", params.sort);
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  url.searchParams.set("limit", String(params.limit ?? 100));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PennylaneApiError(
      res.status,
      `Pennylane API ${res.status} sur ${path} : ${body.slice(0, 500)}`
    );
  }

  return res.json() as Promise<T>;
}

// Récupère toutes les pages d'un endpoint paginé par curseur.
export async function fetchAllPages<T>(
  path: string,
  params: { filter?: Filter[]; sort?: string } = {}
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await pennylaneFetch<PaginatedResponse<T>>(path, {
      ...params,
      cursor,
      limit: 100,
    });
    items.push(...page.items);
    hasMore = page.has_more;
    cursor = page.next_cursor ?? undefined;
  }

  return items;
}
