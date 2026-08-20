import { getTopCustomers, parseYear } from "@/lib/finance";
import { PennylaneApiError } from "@/lib/pennylane";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const data = await getTopCustomers(parseYear(request.url));
    return Response.json(data);
  } catch (err) {
    const status = err instanceof PennylaneApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status });
  }
}
