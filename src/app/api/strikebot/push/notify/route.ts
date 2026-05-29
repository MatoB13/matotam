import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PushRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type NotifyBody = {
  event_type?: string;
  asset?: string;
  severity?: string;
  message?: string;
  signal?: string | null;
  premium_pct?: number | string | null;
  premium_z?: number | string | null;
  price?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

const globalForPg = globalThis as unknown as { strikebotPushNotifyPool?: Pool };

function getPool() {
  const connectionString = process.env.STRIKEBOT_DATABASE_URL;
  if (!connectionString) throw new Error("Missing STRIKEBOT_DATABASE_URL");

  if (!globalForPg.strikebotPushNotifyPool) {
    globalForPg.strikebotPushNotifyPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return globalForPg.strikebotPushNotifyPool;
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } },
  );
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPct(value: unknown): string {
  const parsed = toNumber(value);
  return parsed === null ? "—" : `${parsed.toFixed(4)}%`;
}

function buildNotification(body: NotifyBody) {
  const eventType = String(body.event_type || "STRIKEBOT_EVENT");
  const asset = String(body.asset || "ADA").toUpperCase();
  const signal = body.signal ? ` ${body.signal}` : "";
  const premium = formatPct(body.premium_pct);
  const z = toNumber(body.premium_z);
  const zText = z === null ? "—" : z.toFixed(3);
  const metadata = body.metadata || {};
  const exitReason = typeof metadata.exit_reason === "string" ? metadata.exit_reason : undefined;
  const pnlUsd = metadata.pnl_usd;

  if (eventType === "BURST_MODE_STARTED") {
    return {
      title: `⚡ ${asset} burst started`,
      body: `Premium ${premium}, z ${zText}. Executor should switch to fast loop.`,
      tag: `strikebot-${asset}-burst`,
    };
  }

  if (eventType === "BURST_MODE_ENDED") {
    return {
      title: `✅ ${asset} burst ended`,
      body: `Premium normalized to ${premium}.`,
      tag: `strikebot-${asset}-burst`,
    };
  }

  if (eventType === "LIVE_POSITION_OPENED" || eventType === "LIVE_POSITION_OPEN_CONFIRMED") {
    return {
      title: `🟢 ${asset}${signal} position opened`,
      body: `Premium ${premium}, z ${zText}. Price ${body.price ?? "—"}.`,
      tag: `strikebot-${asset}-position-open`,
    };
  }

  if (eventType === "LIVE_POSITION_CLOSED" || eventType === "LIVE_POSITION_CLOSE_ATTEMPTED" || eventType === "DRY_RUN_POSITION_CLOSED") {
    return {
      title: eventType === "LIVE_POSITION_CLOSE_ATTEMPTED" ? `🔵 ${asset}${signal} close attempted` : `🔵 ${asset}${signal} position closed`,
      body: `${exitReason ? `${exitReason}. ` : ""}PnL ${formatPct(metadata.pnl_pct)} / ${pnlUsd ?? "—"} USD.`,
      tag: `strikebot-${asset}-position-close`,
    };
  }

  if (eventType.includes("REJECTED") || eventType.includes("FAILED")) {
    return {
      title: `⚠️ ${asset} ${eventType.replaceAll("_", " ").toLowerCase()}`,
      body: body.message || `Premium ${premium}, z ${zText}.`,
      tag: `strikebot-${asset}-warning`,
    };
  }

  return {
    title: `Strikebot Live · ${asset}`,
    body: body.message || eventType.replaceAll("_", " "),
    tag: `strikebot-${asset}-event`,
  };
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
  const expectedSecret = process.env.STRIKEBOT_PUSH_NOTIFY_SECRET;
  const providedSecret = request.headers.get("x-strikebot-push-secret");

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return unauthorized();
  }

  const publicKey = process.env.STRIKEBOT_VAPID_PUBLIC_KEY;
  const privateKey = process.env.STRIKEBOT_VAPID_PRIVATE_KEY;
  const subject = process.env.STRIKEBOT_VAPID_SUBJECT || "mailto:martin.bobosik@yahoo.com";

  if (!publicKey || !privateKey) {
    return NextResponse.json({ ok: false, error: "Missing VAPID keys" }, { status: 500 });
  }

  try {
    const body = (await request.json()) as NotifyBody;
    const notification = buildNotification(body);

    await ensureTable();
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const { rows } = await getPool().query<PushRow>(
      "SELECT id, endpoint, p256dh, auth FROM strikebot_push_subscriptions WHERE enabled = TRUE ORDER BY id ASC",
    );

    let sent = 0;
    let disabled = 0;

    await Promise.all(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: {
                p256dh: row.p256dh,
                auth: row.auth,
              },
            },
            JSON.stringify({
              title: notification.title,
              body: notification.body,
              tag: notification.tag,
              url: `/strikebot?token=${encodeURIComponent(process.env.STRIKEBOT_DASHBOARD_TOKEN || "")}`,
            }),
          );
          sent += 1;
        } catch (error) {
          const statusCode = typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : null;

          if (statusCode === 404 || statusCode === 410) {
            await getPool().query(
              "UPDATE strikebot_push_subscriptions SET enabled = FALSE, updated_at = NOW() WHERE id = $1",
              [row.id],
            );
            disabled += 1;
          }
        }
      }),
    );

    return NextResponse.json(
      { ok: true, sent, disabled, subscriptions: rows.length },
      { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
