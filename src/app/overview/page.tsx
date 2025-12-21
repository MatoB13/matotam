// src/app/overview/page.tsx
"use client";

import { useEffect, useState } from "react";
import { DEV_ADDRESS, TEST_ADDRESSES } from "../lib/constants";

interface MatotamOverviewRow {
  txHash: string;
  policyId: string;
  assetNameBase: string;
  assetNameHex: string;
  unit: string;
  senderAddress: string;
  receiverAddress: string;
  messageText: string;
  messageMode: "plaintext" | "encrypted";
  quickBurnId?: string | null;
  rarityCode?: string | null;
  createdAt: string;
  fingerprint?: string | null;
}

interface ApiResponse {
  rows: MatotamOverviewRow[];
  total: number;
}

type AddressKind = "dev" | "test" | "rest";

interface StatItem {
  count: number;
  percent: number;
}

interface OverviewStats {
  totalOnPage: number;
  sent: {
    dev: StatItem;
    test: StatItem;
    rest: StatItem;
  };
  received: {
    dev: StatItem;
    test: StatItem;
    rest: StatItem;
  };
}

export default function OverviewPage() {
  const [rows, setRows] = useState<MatotamOverviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sender, setSender] = useState("");
  const [receiver, setReceiver] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [page, setPage] = useState(1);
  const limit = 50;

  async function loadData(newPage = 1) {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (sender) params.set("sender", sender);
    if (receiver) params.set("receiver", receiver);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(newPage));
    params.set("limit", String(limit));

    try {
      const res = await fetch(`/api/overview?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const data: ApiResponse = await res.json();
      setRows(data.rows);
      setTotal(data.total);
      setPage(newPage);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial load
    loadData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function explorerAddressUrl(addr: string): string {
    return `https://pool.pm/${addr}`;
  }

  function explorerNftUrl(row: MatotamOverviewRow): string {
    // Prefer Blockfrost fingerprint (asset1...)
    if (row.fingerprint) {
      return `https://pool.pm/${row.fingerprint}`;
    }
    // Fallback – use full unit (policyId + assetNameHex)
    return `https://pool.pm/${row.unit}`;
  }

  /**
   * Classify address into dev / test / rest.
   */
  function classifyAddress(address: string): AddressKind {
    if (!address) return "rest";
    if (address === DEV_ADDRESS) return "dev";

    const isTest =
      Array.isArray(TEST_ADDRESSES) &&
      TEST_ADDRESSES.includes(address);

    if (isTest) return "test";
    return "rest";
  }

  /**
   * Badge label for address (dev / test / null).
   */
  function getAddressBadge(address: string): "dev" | "test" | null {
    const kind = classifyAddress(address);
    return kind === "rest" ? null : kind;
  }

  /**
   * Link color class based on address type.
   * - dev + test → blue
   * - rest       → green
   */
  function getAddressLinkClass(address: string): string {
    const kind = classifyAddress(address);
    const base = "hover:underline break-all";

    if (kind === "rest") {
      return `text-green-300 ${base}`;
    }
    return `text-sky-400 ${base}`;
  }

  /**
   * Small pill shown next to dev / test addresses.
   */
  function AddressBadge({ kind }: { kind: "dev" | "test" }) {
    if (kind === "dev") {
      return (
        <span className="ml-1 inline-flex items-center justify-center rounded-full bg-slate-700 text-[10px] uppercase px-1.5 py-0.5 text-slate-200">
          dev
        </span>
      );
    }

    return (
      <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-900/80 text-[10px] uppercase px-1.5 py-0.5 text-amber-200">
        test
      </span>
    );
  }

  /**
   * Compute stats based on rows on the current page.
   * Percentages are relative to totalOnPage.
   */
  function computeStats(currentRows: MatotamOverviewRow[]): OverviewStats {
    const totalOnPage = currentRows.length;

    const sentCounts: Record<AddressKind, number> = {
      dev: 0,
      test: 0,
      rest: 0,
    };

    const recvCounts: Record<AddressKind, number> = {
      dev: 0,
      test: 0,
      rest: 0,
    };

    for (const row of currentRows) {
      const s = classifyAddress(row.senderAddress);
      const r = classifyAddress(row.receiverAddress);
      sentCounts[s] += 1;
      recvCounts[r] += 1;
    }

    function buildGroup(
      groupCounts: Record<AddressKind, number>
    ): { dev: StatItem; test: StatItem; rest: StatItem } {
      const kinds: AddressKind[] = ["dev", "test", "rest"];
      const result: any = {};

      for (const kind of kinds) {
        const count = groupCounts[kind];
        const percent = totalOnPage
          ? Math.round((count * 1000) / totalOnPage) / 10
          : 0;
        result[kind] = { count, percent };
      }

      return result as {
        dev: StatItem;
        test: StatItem;
        rest: StatItem;
      };
    }

    return {
      totalOnPage,
      sent: buildGroup(sentCounts),
      received: buildGroup(recvCounts),
    };
  }

  const stats = computeStats(rows);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Matotam overview</h1>
          <p className="text-sm text-slate-400">
            All minted Matotams discovered via dev address (on-chain metadata).
          </p>
        </header>

        {/* Summary stats for current page */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="col-span-1 md:col-span-1 bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-2">
              <div className="text-xs text-slate-400">Total on this page</div>
              <div className="text-lg font-semibold">
                {stats.totalOnPage}
              </div>
              <div className="text-[11px] text-slate-500">
                Filtered total (all pages): {total}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-2">
              <div className="text-[11px] text-slate-400 mb-1">
                Sent by dev
              </div>
              <div className="text-lg font-semibold">
                {stats.sent.dev.count}
                <span className="text-xs text-slate-400 ml-1">
                  ({stats.sent.dev.percent.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-2">
              <div className="text-[11px] text-slate-400 mb-1">
                Sent by test
              </div>
              <div className="text-lg font-semibold">
                {stats.sent.test.count}
                <span className="text-xs text-slate-400 ml-1">
                  ({stats.sent.test.percent.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-2">
              <div className="text-[11px] text-slate-400 mb-1">
                Sent by others
              </div>
              <div className="text-lg font-semibold">
                {stats.sent.rest.count}
                <span className="text-xs text-slate-400 ml-1">
                  ({stats.sent.rest.percent.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-2">
              <div className="text-[11px] text-slate-400 mb-1">
                Received by dev
              </div>
              <div className="text-lg font-semibold">
                {stats.received.dev.count}
                <span className="text-xs text-slate-400 ml-1">
                  ({stats.received.dev.percent.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-2">
              <div className="text-[11px] text-slate-400 mb-1">
                Received by test
              </div>
              <div className="text-lg font-semibold">
                {stats.received.test.count}
                <span className="text-xs text-slate-400 ml-1">
                  ({stats.received.test.percent.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-2">
              <div className="text-[11px] text-slate-400 mb-1">
                Received by others
              </div>
              <div className="text-lg font-semibold">
                {stats.received.rest.count}
                <span className="text-xs text-slate-400 ml-1">
                  ({stats.received.rest.percent.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            Percentages are computed from Matotams on the current page
            (after filters).
          </div>
        </section>

        {/* Filters */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Sender address contains
              </label>
              <input
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-sm"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="addr1..."
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Receiver address contains
              </label>
              <input
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-sm"
                value={receiver}
                onChange={(e) => setReceiver(e.target.value)}
                placeholder="addr1..."
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Message contains
              </label>
              <input
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-sm"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="keyword..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                From date (UTC)
              </label>
              <input
                type="date"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                To date (UTC)
              </label>
              <input
                type="date"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                className="mt-4 w-full rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium px-3 py-1.5"
                onClick={() => loadData(1)}
                disabled={loading}
              >
                {loading ? "Loading..." : "Apply filters"}
              </button>
            </div>
            <div>
              <button
                className="mt-4 w-full rounded-lg bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5"
                onClick={() => {
                  setSender("");
                  setReceiver("");
                  setQ("");
                  setFrom("");
                  setTo("");
                  loadData(1);
                }}
                disabled={loading}
              >
                Reset filters
              </button>
            </div>
          </div>
        </section>

        {/* Error / info */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {/* Table */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/70 border-b border-slate-800">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-300">
                  Created
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-300">
                  Sender
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-300">
                  Receiver
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-300">
                  Message
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-300">
                  NFT
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-slate-500"
                  >
                    No Matotams found for current filters.
                  </td>
                </tr>
              )}

              {rows.map((row) => {
                const date = new Date(row.createdAt);
                const dateStr = isNaN(date.getTime())
                  ? row.createdAt
                  : date.toISOString().replace("T", " ").slice(0, 19);

                const shortSender =
                  row.senderAddress.length > 20
                    ? row.senderAddress.slice(0, 10) +
                      "..." +
                      row.senderAddress.slice(-6)
                    : row.senderAddress;

                const shortReceiver =
                  row.receiverAddress.length > 20
                    ? row.receiverAddress.slice(0, 10) +
                      "..." +
                      row.receiverAddress.slice(-6)
                    : row.receiverAddress;

                const senderBadge = getAddressBadge(row.senderAddress);
                const receiverBadge = getAddressBadge(row.receiverAddress);

                return (
                  <tr
                    key={`${row.txHash}-${row.unit}`}
                    className="border-t border-slate-800 hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2 align-top text-xs text-slate-400">
                      {dateStr}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <a
                        href={explorerAddressUrl(row.senderAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className={getAddressLinkClass(row.senderAddress)}
                      >
                        {shortSender}
                      </a>
                      {senderBadge && <AddressBadge kind={senderBadge} />}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <a
                        href={explorerAddressUrl(row.receiverAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className={getAddressLinkClass(row.receiverAddress)}
                      >
                        {shortReceiver}
                      </a>
                      {receiverBadge && <AddressBadge kind={receiverBadge} />}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="max-w-md text-xs whitespace-pre-wrap">
                        {row.messageMode === "encrypted" && (
                          <span className="inline-block mr-1 text-yellow-400">
                            🔒
                          </span>
                        )}
                        {row.messageText || "(empty)"}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      <a
                        href={explorerNftUrl(row)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-400 hover:underline"
                      >
                        View on pool.pm
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Pagination */}
        <section className="flex items-center justify-between text-xs text-slate-400">
          <div>
            Total: {total} • Page {page} / {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-slate-800 px-3 py-1 disabled:opacity-40"
              onClick={() => loadData(Math.max(1, page - 1))}
              disabled={loading || page <= 1}
            >
              Prev
            </button>
            <button
              className="rounded-lg bg-slate-800 px-3 py-1 disabled:opacity-40"
              onClick={() => loadData(Math.min(totalPages, page + 1))}
              disabled={loading || page >= totalPages}
            >
              Next
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
