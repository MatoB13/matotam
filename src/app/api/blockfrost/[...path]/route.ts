// src/app/api/blockfrost/[...path]/route.ts
//
// Same-origin proxy for Blockfrost. Client code (wallet.ts, mint.ts, inbox.ts,
// adaHandle.ts, page.tsx, Lucid's Blockfrost provider, ...) calls BLOCKFROST_API
// ("/api/blockfrost") instead of blockfrost.io directly. This route attaches the
// real project_id server-side, so the Blockfrost key never reaches the browser.
import { NextRequest, NextResponse } from "next/server";
import { BLOCKFROST_SERVER_API, BLOCKFROST_SERVER_KEY } from "@/app/lib/constants";

export const dynamic = "force-dynamic";

async function forward(req: NextRequest, path: string[]) {
  if (!BLOCKFROST_SERVER_API || !BLOCKFROST_SERVER_KEY) {
    return NextResponse.json(
      { error: "Blockfrost is not configured on server" },
      { status: 500 }
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

  if (req.method === "POST" || req.method === "PUT") {
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
