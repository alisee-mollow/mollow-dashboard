import "server-only";
import { ExternalApiError, fetchJsonWithRetry } from "./http";

const BASE_URL = "https://api.hubapi.com";

export class HubSpotApiError extends ExternalApiError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "HubSpotApiError";
  }
}

function getToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new HubSpotApiError(
      500,
      "HUBSPOT_ACCESS_TOKEN manquant. Renseigne-le dans .env.local (voir .env.local.example)."
    );
  }
  return token;
}

interface HubSpotPage<T> {
  results: T[];
  paging?: { next?: { after: string } };
}

// Parcourt toutes les pages d'un endpoint HubSpot paginé par curseur `after`.
async function fetchAllHubSpotPages<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const items: T[] = [];
  let after: string | undefined;

  do {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const page = await fetchJsonWithRetry<HubSpotPage<T>>(
      url.toString(),
      getToken(),
      (status, message) => new HubSpotApiError(status, message),
      `HubSpot API sur ${path}`
    );
    items.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);

  return items;
}

export interface HubSpotOwner {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  archived: boolean;
}

export interface HubSpotCompany {
  id: string;
  properties: {
    name: string | null;
    domain: string | null;
    hubspot_owner_id: string | null;
  };
}

export async function getHubSpotOwners(): Promise<HubSpotOwner[]> {
  return fetchAllHubSpotPages<HubSpotOwner>("/crm/v3/owners");
}

export async function getHubSpotCompanies(): Promise<HubSpotCompany[]> {
  return fetchAllHubSpotPages<HubSpotCompany>("/crm/v3/objects/companies", {
    properties: "name,domain,hubspot_owner_id",
  });
}
