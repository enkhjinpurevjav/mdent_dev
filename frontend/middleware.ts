import { NextRequest, NextResponse } from "next/server";

const CANONICAL_HOST = "mdent.cloud";
const DEV_HOST = "dev.mdent.cloud";

function isIpv4(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0];

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === CANONICAL_HOST ||
    hostname === DEV_HOST ||
    isIpv4(hostname)            // <— allows 148.230.100.123
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
