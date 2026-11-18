import "server-only";

// Erreur commune aux clients d'API externes (Pennylane, HubSpot) : les routes
// renvoient `status` tel quel au navigateur.
export class ExternalApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ExternalApiError";
  }
}

const MAX_RETRIES = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GET JSON authentifié par jeton Bearer, avec retry exponentiel sur 429 (en
// respectant Retry-After quand l'API le fournit).
export async function fetchJsonWithRetry<T>(
  url: string,
  token: string,
  makeError: (status: number, message: string) => ExternalApiError,
  label: string
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await sleep(delayMs);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw makeError(res.status, `${label} ${res.status} : ${body.slice(0, 500)}`);
    }

    return res.json() as Promise<T>;
  }

  throw makeError(429, `${label} : rate limit persistant`);
}
