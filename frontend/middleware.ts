import { NextRequest, NextResponse } from "next/server";

const CANONICAL_HOST = "mdent.cloud";
const DEV_HOST = "dev.mdent.cloud";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0];

  // Allow these hosts in all environments
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === CANONICAL_HOST ||
    hostname === DEV_HOST
  ) {
    return NextResponse.next();
  }

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
