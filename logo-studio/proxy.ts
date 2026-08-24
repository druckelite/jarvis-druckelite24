import { NextRequest, NextResponse } from "next/server";

function unauthorized(message = "Anmeldung erforderlich") {
  return new NextResponse(message, {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Druckelite24 Logo Studio", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

export function proxy(request: NextRequest) {
  const username = process.env.APP_USERNAME;
  const password = process.env.APP_PASSWORD;

  // Never expose the app when its protection was not configured on Render.
  if (!username || !password) {
    return new NextResponse("Der geschützte Zugang ist noch nicht eingerichtet.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return unauthorized();

  try {
    const supplied = atob(authorization.slice(6));
    const separator = supplied.indexOf(":");
    if (separator < 0) return unauthorized("Ungültige Anmeldung");

    const suppliedUsername = supplied.slice(0, separator);
    const suppliedPassword = supplied.slice(separator + 1);
    if (suppliedUsername !== username || suppliedPassword !== password) {
      return unauthorized("Ungültige Anmeldung");
    }
  } catch {
    return unauthorized("Ungültige Anmeldung");
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.svg|api/health).*)"],
};
