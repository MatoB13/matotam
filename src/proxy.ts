import { NextRequest, NextResponse } from "next/server";

// dolz.matotam.io serves the DOLZ portfolio dashboard at its root.
export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (!host.startsWith("dolz.")) return NextResponse.next();

  const url = request.nextUrl.clone();
  if (url.pathname === "/dolz" || url.pathname.startsWith("/dolz/") || url.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  url.pathname = url.pathname === "/" ? "/dolz" : `/dolz${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|svg|ico|jpg|jpeg|webp|wasm|js|css|webmanifest|txt)$).*)"],
};
