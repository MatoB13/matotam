import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PushSubscriptionPayload = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

const globalForPg = globalThis as unknown as { strikebotPushPool?: Pool };

function getPool() {
  const connectionString = process.env.STRIKEBOT_DATABASE_URL;
  if (!connectionString) throw new Error("Missing STRIKEBOT_DATABASE_URL");

  if (!globalForPg.strikebotPushPool) {
    globalForPg.strikebotPushPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return globalForPg.strikebotPushPool;
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } },
  );
}

async function ensureTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS strikebot_push_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      device_label TEXT,
      user_agent TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.STRIKEBOT_DASHBOARD_TOKEN;
  const token = request.nextUrl.searchParams.get("token");

  if (!expectedToken || !token || token !== expectedToken) {
    return unauthorized();
  }

  try {
    const body = (await request.json()) as {
      subscription?: PushSubscriptionPayload;
      deviceLabel?: string;
    };
    const subscription = body.subscription;

    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json({ ok: false, error: "Invalid push subscription" }, { status: 400 });
    }

    await ensureTable();
    await getPool().query(
      `
      INSERT INTO strikebot_push_subscriptions (
        endpoint, p256dh, auth, device_label, user_agent, enabled, updated_at, last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        device_label = EXCLUDED.device_label,
        user_agent = EXCLUDED.user_agent,
        enabled = TRUE,
        updated_at = NOW(),
        last_seen_at = NOW()
      `,
      [
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        body.deviceLabel || "Android phone",
        request.headers.get("user-agent") || null,
      ],
    );

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
