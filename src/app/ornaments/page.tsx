"use client";

import { useMemo, useState } from "react";

import {
  wrapMessageForBubble,
  buildBubbleSvg,
  svgToDataUri,
} from "../lib/svgBubble";

import {
  getOrnamentParamsForPair,
  type OrnamentParams,
} from "../lib/swirlEngine";

function buildRarityCode(yearIndex: number, dayIndex: number): string {
  const y = Math.max(0, Math.min(99, yearIndex));
  const d = Math.max(0, Math.min(999, dayIndex));
  const yStr = y.toString().padStart(2, "0");
  const dStr = d.toString().padStart(3, "0");
  return `Y${yStr}D${dStr}`;
}

export default function OrnamentsLabPage() {
  const [sender, setSender] = useState(
    "addr1qxsenderexample000000000000000000000000000"
  );
  const [receiver, setReceiver] = useState(
    "addr1qxrceiverexample00000000000000000000000000"
  );
  const [labMessage, setLabMessage] = useState("Heya from matotam!");

  const [labYear, setLabYear] = useState(0);
  const [labDay, setLabDay] = useState(57);

  const rarityCode = useMemo(
    () => buildRarityCode(labYear, labDay),
    [labYear, labDay]
  );

  const bubbleLines = useMemo(
    () => wrapMessageForBubble(labMessage),
    [labMessage]
  );

  const ornamentParams: OrnamentParams = useMemo(
    () => getOrnamentParamsForPair(sender, receiver, labYear, labDay),
    [sender, receiver, labYear, labDay]
  );

  const previewUri = useMemo(() => {
    const svg = buildBubbleSvg(bubbleLines, rarityCode, ornamentParams);
    return svgToDataUri(svg);
  }, [bubbleLines, rarityCode, ornamentParams]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl space-y-6">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-50">
              matotam · Ornament Lab
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              Local sandbox for the ornament engine: sender + receiver + Y/D →
              rarity code + symmetric ornaments.
            </p>
          </div>
          <span className="text-[10px] text-slate-500">
            /ornaments · internal lab only
          </span>
        </header>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start">
          {/* Controls */}
          <section className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Sender address
              </label>
              <textarea
                className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                rows={3}
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="addr1qxsomething..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Receiver address
              </label>
              <textarea
                className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                rows={3}
                value={receiver}
                onChange={(e) => setReceiver(e.target.value)}
                placeholder="addr1qxsomething..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Preview message
              </label>
              <textarea
                className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                rows={3}
                value={labMessage}
                onChange={(e) => setLabMessage(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">
                  Year index (Y…)
                </label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs"
                  value={labYear}
                  onChange={(e) =>
                    setLabYear(
                      Math.max(0, Math.min(99, Number(e.target.value) || 0))
                    )
                  }
                />
              </div>

              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">
                  Day in year (D…)
                </label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs"
                  value={labDay}
                  onChange={(e) =>
                    setLabDay(
                      Math.max(0, Math.min(999, Number(e.target.value) || 0))
                    )
                  }
                />
              </div>
            </div>

            {/* Debug panel */}
            <div className="text-[11px] text-slate-500 border border-slate-800 rounded-2xl px-3 py-2 bg-slate-950/60 space-y-1">
              <div className="font-semibold text-slate-300">
                Ornament engine debug
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <div>
                  <span className="mr-1">Rarity code:</span>
                  <span className="font-mono">{rarityCode}</span>
                </div>
                <div>
                  <span className="mr-1">Archetype:</span>
                  <span className="font-mono">
                    {ornamentParams.archetypeIndex}
                  </span>
                </div>
                <div>
                  <span className="mr-1">Layers:</span>
                  <span className="font-mono">{ornamentParams.layers}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <div>
                  <span className="mr-1">Amplitude:</span>
                  <span className="font-mono">
                    {ornamentParams.amplitude.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="mr-1">Curvature:</span>
                  <span className="font-mono">
                    {ornamentParams.curvature.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="mr-1">Spread:</span>
                  <span className="font-mono">
                    {ornamentParams.spread.toFixed(1)}
                  </span>
                </div>
              </div>
              <p className="mt-1">
                Swapping sender and receiver keeps the same ornament, since the
                pair key is canonicalized.
              </p>
            </div>
          </section>

          {/* Preview */}
          <section className="rounded-2xl bg-slate-950 border border-slate-800 px-4 py-4 flex items-center justify-center">
            {previewUri ? (
              <img
                src={previewUri}
                alt="matotam ornament preview"
                className="w-full max-w-md mx-auto rounded-2xl border border-slate-800 bg-slate-950"
              />
            ) : (
              <p className="text-xs text-slate-500">
                Provide sender, receiver and message to see the preview.
              </p>
            )}
          </section>
        </div>

        <footer className="pt-3 border-t border-slate-800/60 text-[10px] text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <span>
            Ornament lab is an internal sandbox and does not affect live mints.
          </span>
          <span>
            The same engine is used for on-chain NFT ornament generation.
          </span>
        </footer>
      </div>
    </main>
  );
}
