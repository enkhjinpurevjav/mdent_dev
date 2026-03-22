/**
 * Next.js Edge Middleware — canonical host redirect.
 *
 * In production, if a request arrives on any hostname other than
 * `mdent.cloud` (e.g. the mistyped `mdend.cloud`), redirect permanently
 * to the same path/query on `https://mdent.cloud`.
 *
 * Local development (localhost / 127.0.0.1) is never redirected.
 */

import { NextRequest, NextResponse } from "next/server";

const CANONICAL_HOST = "mdent.cloud";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  // Strip port for comparison (e.g. "mdent.cloud:3000" → "mdent.cloud")
  const hostname = host.split(":")[0];

  // Allow localhost and loopback addresses in all environments
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === CANONICAL_HOST
  ) {
    return NextResponse.next();
  }

  // In production only: redirect any non-canonical host to mdent.cloud
  if (process.env.NODE_ENV === "production") {
    const url = req.nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all paths except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
