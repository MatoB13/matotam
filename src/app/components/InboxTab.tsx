"use client";

import { MatotamMessage } from "../lib/types";
import { shortHash } from "../lib/utils";

type InboxTabProps = {
  walletConnected: boolean;
  inboxLoading: boolean;
  inboxMessages: MatotamMessage[];
  burningUnit: string | null;

  loadInbox: () => void;
  burnMessage: (unit: string) => void;

  onReply: (address: string) => void;
};

export default function InboxTab({
  walletConnected,
  inboxLoading,
  inboxMessages,
  burningUnit,
  loadInbox,
  burnMessage,
  onReply,
}: InboxTabProps) {
  return (
    <div className="space-y-3">
      {!walletConnected && (
        <p className="text-xs text-slate-400 text-center">
          Connect your wallet to see your matotam inbox.
        </p>
      )}

      {walletConnected && (
        <>
          <p className="text-[11px] text-slate-500">
            Note: The inbox scans up to{" "}
            <span className="font-semibold">100 assets</span> per wallet. For
            larger wallets, please use your wallet or pool.pm to browse your
            matotam NFTs and the{" "}
            <span className="font-semibold">Quick Burn</span> tab on matotam.io
            to burn a message. Burn is only possible from the original sender or
            the original recipient of the message.
          </p>

          <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
            <span>Your inbox</span>
            <button
              type="button"
              onClick={loadInbox}
              disabled={inboxLoading}
              className="px-2 py-1 rounded-2xl border border-slate-600 hover:border-sky-500 hover:text-sky-300 disabled:opacity-60"
            >
              {inboxLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {inboxLoading && (
            <p className="text-xs text-slate-400 text-center">
              Loading messages…
            </p>
          )}

          {!inboxLoading && inboxMessages.length === 0 && (
            <p className="text-xs text-slate-500 text-center">
              No matotam messages found for this address yet.
            </p>
          )}

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {inboxMessages.map((m) => (
              <div
                key={m.unit}
                className="rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs space-y-1 hover:bg-slate-900 hover:border-sky-500 transition-colors"
              >
                {m.imageDataUri && (
                  <div className="mb-1">
                    <img
                      src={m.imageDataUri}
                      alt="matotam message preview"
                      className="w-full max-h-40 object-contain rounded-xl border border-slate-800"
                    />
                  </div>
                )}

                <p className="text-slate-100">{m.textPreview || "(no text)"}</p>

                {m.createdAt && (
                  <p className="text-slate-500">Received: {m.createdAt}</p>
                )}

                {m.threadId && (
                  <p className="text-xs text-slate-500">
                    Thread: {m.threadId}
                    {m.threadIndex ? ` (#${m.threadIndex})` : ""}
                  </p>
                )}

                <p className="text-xs text-slate-500">
                  Asset: {shortHash(`${m.policyId}.${m.assetName}`, 8, 6)}
                </p>

                {m.fromAddress && (
                  <p className="text-xs text-slate-500">
                    From: {shortHash(m.fromAddress, 12, 6)}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <a
                    href={
                      m.fingerprint
                        ? `https://pool.pm/${m.fingerprint}`
                        : `https://pool.pm/${m.unit}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-sky-400 hover:text-sky-300"
                  >
                    View on pool.pm
                  </a>

                  {m.fromAddress && (
                    <button
                      type="button"
                      onClick={() => onReply(m.fromAddress!)}
                      className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
                    >
                      ↩ Reply
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => burnMessage(m.unit)}
                    disabled={burningUnit === m.unit}
                    className="inline-flex items-center gap-1 text-red-300 hover:text-red-200 disabled:opacity-60"
                  >
                    {burningUnit === m.unit ? "Burning…" : "🔥 Burn & reclaim ADA"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
