// src/app/api/blockfrost/[...path]/route.ts
//
// Same-origin proxy for Blockfrost. Client code (wallet.ts, mint.ts, inbox.ts,
// adaHandle.ts, page.tsx, Lucid's Blockfrost provider, ...) calls BLOCKFROST_API
// ("/api/blockfrost") instead of blockfrost.io directly. This route attaches the
// real project_id server-side, so the Blockfrost key never reaches the browser.
//
// Because the real key lives here, this route must not become an open relay to
// a metered Blockfrost plan: it only forwards the exact resource groups and
// methods the app itself uses (fail-closed allowlist), throttles per IP, and
// rejects requests whose Origin/Referer clearly point elsewhere.
import { NextRequest, NextResponse } from "next/server";
import { BLOCKFROST_SERVER_API, BLOCKFROST_SERVER_KEY } from "@/app/lib/constants";

export const dynamic = "force-dynamic";

// Top-level Blockfrost resource groups actually used by this app (Lucid's
// Blockfrost provider + wallet.ts/mint.ts/inbox.ts/adaHandle.ts/page.tsx).
// Anything else (ipfs/*, pools/*, governance/*, nutlink/*, ...) is rejected —
// those either cost extra quota/storage or simply aren't needed here.
const ALLOWED_GET_PREFIXES = [
  "epochs",
  "addresses",
  "assets",
  "txs",
  "accounts",
  "scripts",
];

const ALLOWED_ORIGINS = [
  "https://matotam.io",
  "https://www.matotam.io",
  "http://localhost:3000",
  "http://localhost:3001",
];

// Best-effort per-IP throttle. Runs in-memory per server instance, so on
// serverless (Vercel) it only bounds bursts hitting the same warm instance —
// not a hard global guarantee. Combined with the allowlist below it's enough
// to stop casual abuse without adding paid infra (Upstash/KV) for a low-traffic app.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const requestLog = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requestLog.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    requestLog.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // Only reject when we have a value that clearly points elsewhere. Some
  // privacy-hardened browsers omit both headers even for same-origin
  // requests; we don't want to lock those users out on that basis alone —
  // the path/method allowlist and rate limit still apply regardless.
  if (!origin && !referer) return true;

  return ALLOWED_ORIGINS.some(
    (allowed) =>
      (origin && origin === allowed) || (referer && referer.startsWith(allowed))
  );
}

function isAllowedRequest(method: string, path: string[]): boolean {
  if (method === "GET") {
    return ALLOWED_GET_PREFIXES.includes(path[0]);
  }
  if (method === "POST") {
    // Only Lucid's tx submission ever needs a POST through this proxy.
    return path.length === 2 && path[0] === "tx" && path[1] === "submit";
  }
  return false;
}

async function forward(req: NextRequest, path: string[]) {
  if (!BLOCKFROST_SERVER_API || !BLOCKFROST_SERVER_KEY) {
    return NextResponse.json(
      { error: "Blockfrost is not configured on server" },
      { status: 500 }
    );
  }

  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isAllowedRequest(req.method, path)) {
    return NextResponse.json(
      { error: "This Blockfrost resource is not exposed through this proxy" },
      { status: 403 }
    );
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const upstreamUrl = `${BLOCKFROST_SERVER_API}/${path.join("/")}${req.nextUrl.search}`;

  const headers: Record<string, string> = { project_id: BLOCKFROST_SERVER_KEY };
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };

  if (req.method === "POST") {
    init.body = await req.arrayBuffer();
  }

  const upstreamResp = await fetch(upstreamUrl, init);
  const body = await upstreamResp.arrayBuffer();

  return new NextResponse(body, {
    status: upstreamResp.status,
    headers: {
      "content-type": upstreamResp.headers.get("content-type") || "application/json",
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return forward(req, path);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return forward(req, path);
}
