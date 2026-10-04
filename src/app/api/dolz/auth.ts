import { createHash } from "node:crypto";
import { NextRequest } from "next/server";

// SHA-256 of the owner's DOLZ dashboard token. The repo is public, so only the
// hash lives here; the token itself was handed to the owner directly.
const OWNER_TOKEN_SHA256 = "4743035dfd2a43e9bedb9fa13478798113e60e6ca4c86f20fe7367ef7b6abcf0";

/** Any of the owner's private dashboard tokens unlocks the DOLZ pages. */
export function isDolzAuthorized(request: NextRequest): boolean {
  const allowedTokens = [
    process.env.DOLZ_DASHBOARD_TOKEN,
    process.env.SENTIMENT_DASHBOARD_TOKEN,
    process.env.STRIKEBOT_DASHBOARD_TOKEN,
  ].filter((value): value is string => !!value);
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return false;
  return createHash("sha256").update(token).digest("hex") === OWNER_TOKEN_SHA256 || allowedTokens.includes(token);
}
