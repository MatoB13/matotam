"use client";

import { useMemo, useState } from "react";
import {
  wrapMessageForBubble,
  buildBubbleSvg,
  svgToDataUri,
} from "../lib/svgBubble";
import { getRarityInfo } from "../lib/rarity";
import { getOrnamentParamsForPair } from "../lib/swirlEngine";
import {
  getSigilSvgForAddress,
  getSigilParamsForAddress,
  SIGIL_COLORS,
  SIGIL_INTERIORS,
  SIGIL_FRAMES,
} from "../lib/sigilEngine";

type SendTabProps = {
  message: string;
  setMessage: (v: string) => void;

  toAddress: string;
  setToAddress: (v: string) => void;

  loading: boolean;
  onSend: () => void;

  // Encryption controls
  sendEncrypted: boolean;
  setSendEncrypted: (v: boolean) => void;
  passphrase: string;
  setPassphrase: (v: string) => void;
  confirmPassphrase: string;
  setConfirmPassphrase: (v: string) => void;

  // Sender address for preview / sigil
  senderAddress: string | null;
};

type SigilChoiceRow = {
  key: string;
  label: string;
  probability: number;
  isCurrent: boolean;
};

/**
 * Build rows (label + probability + current flag) for a given sigil dimension.
 * Uses `probability` fields from SIGIL_* arrays (fractions 0..1), rendered as %.
 */
function buildChoiceRows(pool: any[], currentKey: string | null): SigilChoiceRow[] {
  if (!Array.isArray(pool) || pool.length === 0) return [];

  const totalProb =
    pool.reduce((sum, item) => {
      const p =
        typeof item?.probability === "number" && item.probability > 0
          ? item.probability
          : 0;
      return sum + p;
    }, 0) || 1;

  return pool.map((item) => {
    const key: string =
      item?.id ?? item?.key ?? item?.name ?? String(item?.value ?? "");
    const label: string =
      typeof item?.label === "string" ? item.label : key ?? "Unknown";

    const p =
      typeof item?.probability === "number" && item.probability > 0
        ? item.probability
        : 0;

    const probability = (p / totalProb) * 100;

    return {
      key,
      label,
      probability,
      isCurrent: !!currentKey && currentKey === key,
    };
  });
}

/**
 * Very simple tier function based on probability (%).
 * Lower probability -> higher tier.
 */
function probabilityToTier(
  probability: number | null
): "legendary" | "rare" | "uncommon" | "common" {
  if (probability == null) return "common";
  if (probability <= 1) return "legendary";
  if (probability <= 5) return "rare";
  if (probability <= 20) return "uncommon";
  return "common";
}

/**
 * Aggregate tier labels into a single, human-friendly rating.
 */
function buildOverallSigilRating(
  tiers: ("legendary" | "rare" | "uncommon" | "common")[]
): string {
  const counts = tiers.reduce(
    (acc, t) => {
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if ((counts["legendary"] ?? 0) > 0) return "Legendary sigil";
  if ((counts["rare"] ?? 0) >= 2) return "Very rare sigil";
  if ((counts["rare"] ?? 0) >= 1) return "Rare sigil";
  if ((counts["uncommon"] ?? 0) >= 1) return "Uncommon sigil";
  return "Common sigil";
}

export default function SendTab({
  message,
  setMessage,
  toAddress,
  setToAddress,
  loading,
  onSend,
  sendEncrypted,
  setSendEncrypted,
  passphrase,
  setPassphrase,
  confirmPassphrase,
  setConfirmPassphrase,
  senderAddress,
}: SendTabProps) {
  // Passphrase fields visibility (independent toggle)
  const [showPassphrase, setShowPassphrase] = useState(false);

  // Collapsible panels
  const [showPreview, setShowPreview] = useState(true);
  const [showSigilDetails, setShowSigilDetails] = useState(false);

  const remainingChars = 256 - message.length;
  const remainingSafe = remainingChars >= 0 ? remainingChars : 0;

  // Sigil params for the current sender address (if available)
  const sigilParams = useMemo(
    () => (senderAddress ? getSigilParamsForAddress(senderAddress) : null),
    [senderAddress]
  );

  const sigilColorKey: string | null = sigilParams?.color.id ?? null;
  const sigilFrameKey: string | null = sigilParams?.frame.id ?? null;
  const sigilInteriorKey: string | null = sigilParams?.interior.id ?? null;

  // Build tables for each dimension
  const colorRows = useMemo(
    () => buildChoiceRows((SIGIL_COLORS as any[]) ?? [], sigilColorKey),
    [sigilColorKey]
  );
  const frameRows = useMemo(
    () => buildChoiceRows((SIGIL_FRAMES as any[]) ?? [], sigilFrameKey),
    [sigilFrameKey]
  );
  const interiorRows = useMemo(
    () => buildChoiceRows((SIGIL_INTERIORS as any[]) ?? [], sigilInteriorKey),
    [sigilInteriorKey]
  );

  // Current probabilities per dimension
  const currentColorProb = colorRows.find((r) => r.isCurrent)?.probability ?? null;
  const currentFrameProb = frameRows.find((r) => r.isCurrent)?.probability ?? null;
  const currentInteriorProb =
    interiorRows.find((r) => r.isCurrent)?.probability ?? null;

  const sigilRating = useMemo(() => {
    const tiers: ("legendary" | "rare" | "uncommon" | "common")[] = [
      probabilityToTier(currentColorProb),
      probabilityToTier(currentFrameProb),
      probabilityToTier(currentInteriorProb),
    ];
    return buildOverallSigilRating(tiers);
  }, [currentColorProb, currentFrameProb, currentInteriorProb]);

  const previewStatusText = useMemo(() => {
    if (sendEncrypted) return "Preview disabled (encrypted)";
    if (!message.trim()) return "No message yet";
    return "Ready";
  }, [message, sendEncrypted]);

  // Build live preview SVG data URI that matches minted Matotam.
  // Intentionally disabled for encrypted messages.
  const previewUri = useMemo(() => {
    if (!showPreview) return "";
    if (sendEncrypted) return "";
    const trimmed = message.trim();
    if (!trimmed) return "";

    const text = trimmed.slice(0, 256);
    const bubbleLines = wrapMessageForBubble(text);

    // Match your existing rarity/orna pipeline (as in your current app).
    const rarityInfo = getRarityInfo(new Date());
    const rarityCode = rarityInfo.rarityCode;

    const sender = senderAddress ?? "addr1-matotam-preview-sender";
    const receiver = toAddress || "addr1-matotam-preview-recipient";

    const ornamentParams = getOrnamentParamsForPair(
      sender,
      receiver,
      rarityInfo.projectYear,
      rarityInfo.dayInYear
    );

    const sigilSvg = getSigilSvgForAddress(sender);
    const svg = buildBubbleSvg(bubbleLines, rarityCode, ornamentParams, sigilSvg);

    return svgToDataUri(svg);
  }, [showPreview, message, toAddress, sendEncrypted, senderAddress]);

  return (
    <div className="rounded-2xl bg-slate-950/60 border border-slate-800 px-4 py-4 space-y-4">
      {/* Message input */}
      <div>
        <label className="block text-sm mb-1">Message</label>
        <textarea
          className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          rows={4}
          maxLength={256}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message (max 256 characters)..."
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-slate-500">
            {sendEncrypted
              ? "Message will be stored on-chain as encrypted data."
              : "Message will be stored directly on-chain in text + SVG."}
          </span>
          <span className="text-xs text-slate-400">
            {message.length}/256 ({remainingSafe} left)
          </span>
        </div>
      </div>

      {/* Recipient */}
      <div>
        <label className="block text-sm mb-1">Recipient address or $handle</label>
        <input
          type="text"
          className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          placeholder="addr1... or $handle"
        />
        <p className="text-xs text-slate-500 mt-1">
          You can paste a full Cardano address or an ADA handle (e.g. $mato).
        </p>
      </div>

      {/* Encryption options */}
      <div className="space-y-2 rounded-2xl bg-slate-950/80 border border-slate-800 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm">Encrypt message on-chain</div>
            <div className="text-xs text-slate-500">
              When enabled, only an encrypted payload is stored on-chain. The real text is never written into metadata.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSendEncrypted(!sendEncrypted)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border border-slate-700 transition ${
              sendEncrypted ? "bg-sky-500" : "bg-slate-900"
            }`}
            aria-label="Toggle encryption"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                sendEncrypted ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <button
          type="button"
          className="text-xs text-sky-400 underline underline-offset-2"
          onClick={() => setShowPassphrase((prev) => !prev)}
        >
          {showPassphrase ? "Hide passphrase fields" : "Show passphrase fields"}
        </button>

        {(sendEncrypted || showPassphrase) && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-xs mb-1">Passphrase</label>
              <input
                type="password"
                className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Choose a strong passphrase"
              />
            </div>
            <div>
              <label className="block text-xs mb-1">Confirm passphrase</label>
              <input
                type="password"
                className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Type it again"
              />
            </div>
          </div>
        )}
      </div>

      {/* Preview (collapsible) - placed after encryption and before Sigil details */}
      <div className="rounded-2xl bg-slate-950/80 border border-slate-800">
        <button
          type="button"
          onClick={() => setShowPreview((prev) => !prev)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs"
        >
          <div className="flex flex-col items-start">
            <span className="font-medium text-slate-100">Preview</span>
            <span className="text-[11px] text-slate-400">
              This is how your Matotam will look on-chain.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 whitespace-nowrap">
              {previewStatusText}
            </span>
            <span className="text-slate-400 text-sm">{showPreview ? "−" : "+"}</span>
          </div>
        </button>

        {showPreview && (
          <div className="px-3 pb-3 pt-1">
            {sendEncrypted ? (
              <div className="rounded-2xl bg-slate-950 border border-slate-800 px-4 py-4 text-center">
                <span className="text-[11px] text-slate-500">
                  Preview is disabled for encrypted messages (the plaintext is not stored on-chain).
                </span>
              </div>
            ) : !message.trim() ? (
              <div className="rounded-2xl bg-slate-950 border border-slate-800 px-4 py-4 text-center">
                <span className="text-[11px] text-slate-500">
                  Start typing your message to see the on-chain bubble preview.
                </span>
              </div>
            ) : (
              <div className="w-full max-w-[600px] mx-auto rounded-3xl bg-slate-950 border border-slate-800 px-4 py-4 flex items-center justify-center">
                <img
                  src={previewUri}
                  alt="Matotam preview"
                  className="max-w-full h-auto rounded-2xl"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sigil details accordion */}
      {senderAddress && (
        <div className="rounded-2xl bg-slate-950/80 border border-slate-800">
          <button
            type="button"
            onClick={() => setShowSigilDetails((prev) => !prev)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs"
          >
            <div className="flex flex-col items-start">
              <span className="font-medium text-slate-100">Sigil details</span>
              <span className="text-[11px] text-slate-400">
                Deterministic sigil derived from your sender address.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-sky-300 whitespace-nowrap">{sigilRating}</span>
              <span className="text-slate-400 text-sm">{showSigilDetails ? "−" : "+"}</span>
            </div>
          </button>

          {showSigilDetails && (
            <div className="px-3 pb-3 pt-1 text-xs space-y-3">
              <p className="text-slate-400">
                Every Matotam sigil is computed from the sender address. The same address will always produce the same sigil,
                with parameters drawn from weighted rarity pools.
              </p>

              <div className="grid grid-cols-1 gap-3">
                {/* Color table */}
                {colorRows.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-100">Color</span>
                      {sigilColorKey && (
                        <span className="text-[11px] text-sky-300">
                          Current: {colorRows.find((r) => r.isCurrent)?.label ?? sigilColorKey}
                        </span>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                      <table className="w-full border-collapse text-[11px]">
                        <thead className="bg-slate-900/70 text-slate-400">
                          <tr>
                            <th className="px-2 py-1 text-left font-normal">Option</th>
                            <th className="px-2 py-1 text-right font-normal">Chance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {colorRows.map((row) => (
                            <tr
                              key={row.key}
                              className={
                                row.isCurrent ? "bg-sky-950/40 text-sky-100" : "text-slate-300"
                              }
                            >
                              <td className="px-2 py-1">
                                {row.label}
                                {row.isCurrent && (
                                  <span className="ml-1 text-[10px] uppercase tracking-wide text-sky-300">
                                    (current)
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-right">{row.probability.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Frame table */}
                {frameRows.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-100">Frame</span>
                      {sigilFrameKey && (
                        <span className="text-[11px] text-sky-300">
                          Current: {frameRows.find((r) => r.isCurrent)?.label ?? sigilFrameKey}
                        </span>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                      <table className="w-full border-collapse text-[11px]">
                        <thead className="bg-slate-900/70 text-slate-400">
                          <tr>
                            <th className="px-2 py-1 text-left font-normal">Option</th>
                            <th className="px-2 py-1 text-right font-normal">Chance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {frameRows.map((row) => (
                            <tr
                              key={row.key}
                              className={
                                row.isCurrent ? "bg-sky-950/40 text-sky-100" : "text-slate-300"
                              }
                            >
                              <td className="px-2 py-1">
                                {row.label}
                                {row.isCurrent && (
                                  <span className="ml-1 text-[10px] uppercase tracking-wide text-sky-300">
                                    (current)
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-right">{row.probability.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Interior table */}
                {interiorRows.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-100">Interior</span>
                      {sigilInteriorKey && (
                        <span className="text-[11px] text-sky-300">
                          Current: {interiorRows.find((r) => r.isCurrent)?.label ?? sigilInteriorKey}
                        </span>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                      <table className="w-full border-collapse text-[11px]">
                        <thead className="bg-slate-900/70 text-slate-400">
                          <tr>
                            <th className="px-2 py-1 text-left font-normal">Option</th>
                            <th className="px-2 py-1 text-right font-normal">Chance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {interiorRows.map((row) => (
                            <tr
                              key={row.key}
                              className={
                                row.isCurrent ? "bg-sky-950/40 text-sky-100" : "text-slate-300"
                              }
                            >
                              <td className="px-2 py-1">
                                {row.label}
                                {row.isCurrent && (
                                  <span className="ml-1 text-[10px] uppercase tracking-wide text-sky-300">
                                    (current)
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-right">{row.probability.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Send button */}
      <button
        type="button"
        onClick={onSend}
        disabled={loading}
        className="w-full rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:hover:bg-sky-500 text-slate-950 text-sm font-semibold py-2 disabled:opacity-60"
      >
        {loading ? "Sending..." : "Mint & Send (~2.5 ADA)"}
      </button>
    </div>
  );
}
