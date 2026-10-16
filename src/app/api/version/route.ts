import { NextResponse } from "next/server";

/** The build this deployment serves; an open page compares it with its own (see NewVersionBar). */
export function GET() {
  return NextResponse.json({ build: process.env.APP_BUILD_ID ?? null }, { headers: { "Cache-Control": "no-store" } });
}
