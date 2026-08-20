import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Authentification basique optionnelle pour protéger le dashboard une fois déployé
// publiquement (données financières sensibles — cf. cahier des charges section 6).
// Activée uniquement si DASHBOARD_PASSWORD est renseigné.
export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice(6));
    const [, providedPassword] = decoded.split(":");
    if (providedPassword === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentification requise", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Mollow Dashboard"' },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
