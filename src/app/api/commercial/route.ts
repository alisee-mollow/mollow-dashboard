import { parseYear } from "@/lib/finance";
import { ExternalApiError } from "@/lib/http";
import { getSalesData } from "@/lib/sales";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const data = await getSalesData(parseYear(request.url));
    return Response.json(data);
  } catch (err) {
    const status = err instanceof ExternalApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status });
  }
}
