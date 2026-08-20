import { getRevenueByCategory } from "@/lib/finance";
import { PennylaneApiError } from "@/lib/pennylane";

export async function GET() {
  try {
    const data = await getRevenueByCategory();
    return Response.json(data);
  } catch (err) {
    const status = err instanceof PennylaneApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status });
  }
}
