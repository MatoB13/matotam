"use client";

import { useState } from "react";
import {
  getSigilParamsForAddress,
  getSigilSvgForAddress,
  renderSigilSvg,
  SIGIL_COLORS,
  SIGIL_INTERIORS,
  SIGIL_FRAMES,
} from "@/app/lib/sigilEngine";

// -------------------------------------------------------------
// Utility helpers
// -------------------------------------------------------------

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Format probability as "1 in N" and percentage string.
 */
function formatRarity(probability: number): { ratio: string; percent: string } {
  if (probability <= 0) {
    return { ratio: "n/a", percent: "0%" };
  }

  const ratio = Math.round(1 / probability);
  const ratioStr =
    ratio > 1_000_000_000
      ? "> 1 in 1,000,000,000"
      : `1 in ${ratio.toLocaleString("en-US")}`;

  const percentStr =
    probability < 0.0001
      ? "< 0.01%"
      : `${(probability * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%`;

  return { ratio: ratioStr, percent: percentStr };
}

/**
 * Normalize any wallet/handle input:
 * - If it starts with "$", treat as ADA handle (lowercase)
 * - Else treat as raw address (trim spaces)
 */
function normalizeAddress(input: string): string {
  const t = input.trim();
  if (!t) return "";
  if (t.startsWith("$")) return t.toLowerCase();
  return t;
}

// -------------------------------------------------------------
// Main Sigil Lab page component
// -------------------------------------------------------------

export default function Page() {
  // Raw user input for address / handle
  const [rawAddress, setRawAddress] = useState(
    "addr1q9examplematotamsender000000000000000000000000000000000"
  );

  // Mode toggle: "auto" = derived from sender, "manual" = user-selected params
  const [mode, setMode] = useState<"auto" | "manual">("auto");

  // Manual parameter selection
  const [manualColorId, setManualColorId] = useState(SIGIL_COLORS[0].id);
  const [manualInteriorId, setManualInteriorId] = useState(
    SIGIL_INTERIORS[0].id
  );
  const [manualFrameId, setManualFrameId] = useState(SIGIL_FRAMES[0].id);

  // Normalize + derive effective address (for auto mode)
  const effectiveAddress = normalizeAddress(rawAddress);

  // AUTO params (from address) vs MANUAL params (from dropdowns)
  const autoParams = getSigilParamsForAddress(
    effectiveAddress ||
      "addr1q9fallbackmatotamsender00000000000000000000000000000000"
  );

  const manualParams = {
    color: SIGIL_COLORS.find((c) => c.id === manualColorId)!,
    interior: SIGIL_INTERIORS.find((i) => i.id === manualInteriorId)!,
    frame: SIGIL_FRAMES.find((f) => f.id === manualFrameId)!,
  };

  const params = mode === "auto" ? autoParams : manualParams;

  // SVG generation
  const svg =
    mode === "auto"
      ? getSigilSvgForAddress(
          effectiveAddress ||
            "addr1q9fallbackmatotamsender00000000000000000000000000000000",
          64
        )
      : renderSigilSvg(params, 64);

  // Rarity calculation
  const colorRarity = formatRarity(params.color.probability);
  const interiorRarity = formatRarity(params.interior.probability);
  const frameRarity = formatRarity(params.frame.probability);

  const combinedProbability =
    params.color.probability *
    params.interior.probability *
    params.frame.probability;
  const combinedRarity = formatRarity(combinedProbability);

  // Demo presets used for galleries (to isolate shape differences)
  const demoColor =
    SIGIL_COLORS.find((c) => c.id === "light_blue") ?? SIGIL_COLORS[0];
  const demoInteriorForFrames =
    SIGIL_INTERIORS.find((i) => i.id === "radiant_burst") ??
    SIGIL_INTERIORS[0];
  const demoFrameForInteriors =
    SIGIL_FRAMES.find((f) => f.id === "circle") ?? SIGIL_FRAMES[0];

  const handleCopy = () => {
    if (!svg) return;
    navigator.clipboard.writeText(svg).catch(() => {
      // ignore clipboard errors in lab
    });
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl space-y-8">
        {/* -------------------------------------------------------------
            HEADER
        -------------------------------------------------------------- */}
        <header className="flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">
              Matotam Sigil Lab
            </h1>
            <p className="text-sm text-slate-400">
              Deterministic sender sigil preview &amp; rarity breakdown.
            </p>
          </div>

          <div className="text-xs text-slate-500 text-right">
            Same engine will be embedded into Matotam message NFTs.
          </div>
        </header>

        {/* -------------------------------------------------------------
            INPUT SECTION
        -------------------------------------------------------------- */}
        <section className="space-y-4">
          {/* MODE SWITCH */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300 font-medium">Mode:</span>

            <button
              onClick={() => setMode("auto")}
              className={classNames(
                "px-3 py-1.5 rounded-lg text-sm border",
                mode === "auto"
                  ? "bg-sky-600 border-sky-500 text-white"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              )}
            >
              Auto (from sender)
            </button>

            <button
              onClick={() => setMode("manual")}
              className={classNames(
                "px-3 py-1.5 rounded-lg text-sm border",
                mode === "manual"
                  ? "bg-sky-600 border-sky-500 text-white"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              )}
            >
              Manual (choose params)
            </button>
          </div>

          {/* ADDRESS INPUT (only for auto mode) */}
          {mode === "auto" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Sender address / ADA handle
              </label>
              <input
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="addr1... or $handle"
                value={rawAddress}
                onChange={(e) => setRawAddress(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Sigil is derived deterministically using 3 independent rolls.
              </p>
            </div>
          )}

          {/* MANUAL DROPDOWNS */}
          {mode === "manual" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* COLOR SELECT */}
              <div className="space-y-1">
                <label className="block text-xs text-slate-400">Color</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200"
                  value={manualColorId}
                  onChange={(e) => setManualColorId(e.target.value as any)}
                >
                  {SIGIL_COLORS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* INTERIOR SELECT */}
              <div className="space-y-1">
                <label className="block text-xs text-slate-400">Interior</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200"
                  value={manualInteriorId}
                  onChange={(e) => setManualInteriorId(e.target.value as any)}
                >
                  {SIGIL_INTERIORS.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* FRAME SELECT */}
              <div className="space-y-1">
                <label className="block text-xs text-slate-400">Frame</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200"
                  value={manualFrameId}
                  onChange={(e) => setManualFrameId(e.target.value as any)}
                >
                  {SIGIL_FRAMES.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>

        {/* -------------------------------------------------------------
            PREVIEW + DETAILS
        -------------------------------------------------------------- */}
        <section className="grid gap-8 md:grid-cols-[minmax(0,2fr),minmax(0,3fr)] pt-4">
          {/* PREVIEW CARD */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 flex flex-col items-center justify-center">
            <div className="text-xs text-slate-400 mb-2">
              Preview (64×64 viewBox; scaled automatically in NFT bubble)
            </div>

            <div className="inline-flex items-center justify-center rounded-full bg-slate-900/70 p-4 w-28 h-28">
              {svg ? (
                <div
                  className="w-full h-full"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : (
                <span className="text-[10px] text-slate-500">No data</span>
              )}
            </div>

            {mode === "auto" && (
              <div className="mt-3 text-[11px] text-slate-500 break-all text-center">
                {effectiveAddress || "—"}
              </div>
            )}

            {/* COPY SVG BUTTON */}
            <button
              onClick={handleCopy}
              className="mt-3 flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 rounded-lg text-slate-300"
            >
              Copy SVG
            </button>
          </div>

          {/* RARITY BREAKDOWN */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-slate-100">
              Sigil parameters &amp; rarity
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-slate-200">Color</span>
                <span className="text-slate-400">
                  {params.color.label} · {colorRarity.percent} (
                  {colorRarity.ratio})
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-slate-200">Interior</span>
                <span className="text-slate-400">
                  {params.interior.label} · {interiorRarity.percent} (
                  {interiorRarity.ratio})
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-slate-200">Frame</span>
                <span className="text-slate-400">
                  {params.frame.label} · {frameRarity.percent} (
                  {frameRarity.ratio})
                </span>
              </div>

              <div className="h-px bg-slate-800 my-2" />

              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-slate-100">
                  Combined rarity
                </span>
                <span className="text-slate-200">
                  {combinedRarity.percent} ({combinedRarity.ratio})
                </span>
              </div>

              <p className="mt-2 text-[11px] text-slate-500">
                Combined rarity is computed as the product of independent
                probabilities of the selected color, interior and frame.
              </p>

              {mode === "manual" && (
                <p className="text-[11px] text-slate-500">
                  In manual mode, rarity reflects the probability of randomly
                  rolling this exact combination during normal mints.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------
            CONFIGURED OPTIONS (GALLERIES)
        -------------------------------------------------------------- */}
        <section className="pt-4 border-t border-slate-800 space-y-5">
          <h2 className="text-sm font-semibold text-slate-100">
            All configured sigil options
          </h2>
          <p className="text-[11px] text-slate-500">
            Below you can see every configured color, interior and frame.
            This is useful to visually validate shapes and rarity distribution
            independently of any address.
          </p>

          <div className="grid gap-4 md:grid-cols-3 text-xs">
            {/* COLORS */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <h3 className="font-medium text-slate-200">Colors</h3>
              <ul className="space-y-1">
                {SIGIL_COLORS.map((c) => {
                  const r = formatRarity(c.probability);
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-slate-900"
                          style={{ backgroundColor: c.fill }}
                        />
                        <span>{c.label}</span>
                      </span>
                      <span className="text-slate-400 whitespace-nowrap">
                        {r.percent} ({r.ratio})
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* INTERIORS (WITH PREVIEW) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <h3 className="font-medium text-slate-200">Interiors</h3>
              <ul className="space-y-2">
                {SIGIL_INTERIORS.map((i) => {
                  const r = formatRarity(i.probability);
                  const interiorSvg = renderSigilSvg(
                    {
                      color: demoColor,
                      interior: i,
                      frame: demoFrameForInteriors,
                    },
                    64
                  );
                  return (
                    <li
                      key={i.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-10 h-10 rounded-full bg-slate-900/80 flex items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: interiorSvg }}
                        />
                        <span>{i.label}</span>
                      </div>
                      <span className="text-slate-400 text-[11px] whitespace-nowrap">
                        {r.percent} ({r.ratio})
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* FRAMES (WITH PREVIEW) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <h3 className="font-medium text-slate-200">Frames</h3>
              <ul className="space-y-2">
                {SIGIL_FRAMES.map((f) => {
                  const r = formatRarity(f.probability);
                  const frameSvg = renderSigilSvg(
                    {
                      color: demoColor,
                      interior: demoInteriorForFrames,
                      frame: f,
                    },
                    64
                  );
                  return (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-10 h-10 rounded-full bg-slate-900/80 flex items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: frameSvg }}
                        />
                        <span>{f.label}</span>
                      </div>
                      <span className="text-slate-400 text-[11px] whitespace-nowrap">
                        {r.percent} ({r.ratio})
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------
            FOOTER
        -------------------------------------------------------------- */}
        <footer className="pt-3 border-t border-slate-800/60 text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <span>
            Sigil lab is an internal sandbox and does not affect live mints.
          </span>
          <span>
            The same configuration will be used when sigils are embedded into
            Matotam message NFTs.
          </span>
        </footer>
      </div>
    </main>
  );
}
