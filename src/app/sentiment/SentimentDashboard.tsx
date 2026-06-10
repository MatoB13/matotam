"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./sentiment.module.css";

type JsonValue = unknown;

type SentimentPrediction = {
  run_id: string;
  trade_date: string;
  ticker: string;
  asset_type: string | null;
  decision: string;
  up_probability: string | number | null;
  sideways_probability: string | number | null;
  down_probability: string | number | null;
  confidence: string | number | null;
  entry_price: string | number | null;
  reference_price: string | number | null;
  status: string | null;
  data_json: JsonValue;
  reasoning_json: JsonValue;
  created_at: string;
  updated_at: string;
};

type SentimentPaperTrade = {
  id: number;
  prediction_run_id: string;
  trade_date: string;
  ticker: string;
  decision: string;
  entry_price: string | number | null;
  current_price: string | number | null;
  exit_price: string | number | null;
  current_pnl_pct: string | number | null;
  realized_pnl_pct: string | number | null;
  max_profit_pct: string | number | null;
  max_loss_pct: string | number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
};

type SentimentEvaluation = {
  id: number;
  prediction_run_id: string;
  trade_date: string;
  ticker: string;
  decision: string;
  reference_price: string | number | null;
  evaluation_price: string | number | null;
  result_pct: string | number | null;
  actual_outcome: string | null;
  hit: boolean | null;
  evaluated_at: string;
};

type SentimentPerformance = {
  predictions_total: string;
  trade_count: string;
  closed_count: string;
  open_count: string;
  winners: string;
  losers: string;
  avg_realized_pnl_pct: string | null;
  total_realized_pnl_pct: string | null;
  best_trade_pct: string | null;
  worst_trade_pct: string | null;
  evaluated_count?: string;
  evaluated_hits?: string;
  evaluated_misses?: string;
  evaluation_hit_rate_pct?: string | null;
};

type SentimentData = {
  generatedAt: string;
  latestDate: string | null;
  latest: SentimentPrediction[];
  history: SentimentPrediction[];
  paperTrades: SentimentPaperTrade[];
  evaluations?: SentimentEvaluation[];
  performance: SentimentPerformance;
};

type ApiResponse = {
  ok: boolean;
  data?: SentimentData;
  error?: string;
};

const REFRESH_SECONDS = 60;

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: string | number | null | undefined, digits = 4): string {
  const parsed = toNumber(value);
  if (parsed === null) return "—";
  return parsed.toFixed(digits);
}

function formatPct(value: string | number | null | undefined, digits = 2): string {
  const parsed = toNumber(value);
  if (parsed === null) return "—";
  return `${parsed.toFixed(digits)}%`;
}

function formatConfidence(value: string | number | null | undefined): string {
  const parsed = toNumber(value);
  if (parsed === null) return "—";
  return `${Math.round(parsed * 100)}%`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function classForDecision(decision: string | null | undefined): string {
  const normalized = String(decision ?? "").trim().toUpperCase();
  if (normalized === "LONG") return styles.goodText;
  if (normalized === "SHORT") return styles.badText;
  if (normalized === "NO_TRADE") return styles.warnText;
  return styles.mutedText;
}

function classForPnl(value: string | number | null | undefined): string {
  const parsed = toNumber(value);
  if (parsed === null) return styles.mutedText;
  return parsed >= 0 ? styles.goodText : styles.badText;
}

function asRecord(value: JsonValue): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function extractReasoning(prediction: SentimentPrediction): {
  summary: string;
  bullish: string[];
  bearish: string[];
  risks: string[];
  raw: Record<string, unknown>;
} {
  const raw = asRecord(prediction.reasoning_json);
  const summary =
    String(raw.reasoning || raw.summary || raw.reason || raw.final_assessment || raw.decision_reason || "No reasoning stored.");

  const bullish = Array.isArray(raw.bullish_factors)
    ? raw.bullish_factors.map(String)
    : Array.isArray(raw.bullish)
      ? raw.bullish.map(String)
      : [];
  const bearish = Array.isArray(raw.bearish_factors)
    ? raw.bearish_factors.map(String)
    : Array.isArray(raw.bearish)
      ? raw.bearish.map(String)
      : [];
  const risks = Array.isArray(raw.key_risks)
    ? raw.key_risks.map(String)
    : Array.isArray(raw.risks)
      ? raw.risks.map(String)
      : [];

  return { summary, bullish, bearish, risks, raw };
}

function winRate(performance: SentimentPerformance | undefined): number {
  const winners = toNumber(performance?.winners) ?? 0;
  const losers = toNumber(performance?.losers) ?? 0;
  const total = winners + losers;
  return total > 0 ? (winners / total) * 100 : 0;
}

function MetricCard({ label, value, detail, className }: { label: string; value: string; detail: string; className?: string }) {
  return (
    <article className={styles.metricCard}>
      <span>{label}</span>
      <strong className={className}>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export default function SentimentDashboard({ token }: { token: string }) {
  const [data, setData] = useState<SentimentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [selectedTicker, setSelectedTicker] = useState<string>("ALL");

  const loadData = useCallback(async () => {
    if (!token) {
      setError("Missing dashboard token in URL.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/sentiment/status?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error || `Request failed: ${response.status}`);
      }

      setData(payload.data);
      setError(null);
      setLastRefresh(new Date());
      setCountdown(REFRESH_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void loadData();
    }, REFRESH_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh, loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  const latest = data?.latest ?? [];
  const paperTrades = data?.paperTrades ?? [];
  const evaluations = data?.evaluations ?? [];
  const performance = data?.performance;

  const tickers = useMemo(() => {
    const values = new Set<string>();
    latest.forEach((item) => values.add(item.ticker));
    (data?.history ?? []).forEach((item) => values.add(item.ticker));
    return ["ALL", ...Array.from(values).sort()];
  }, [data, latest]);

  const filteredHistory = useMemo(() => {
    const rows = data?.history ?? [];
    if (selectedTicker === "ALL") return rows;
    return rows.filter((row) => row.ticker === selectedTicker);
  }, [data, selectedTicker]);

  const openTrades = useMemo(() => paperTrades.filter((trade) => trade.status === "PAPER_OPEN"), [paperTrades]);
  const closedTrades = useMemo(() => paperTrades.filter((trade) => trade.status === "PAPER_CLOSED"), [paperTrades]);

  return (
    <main className={styles.pageShell}>
      <div className={styles.backgroundGlow} />

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>matotam.io private monitor</p>
          <h1 className={styles.title}>MARKET SENTIMENT <span>AI PAPER BOT</span></h1>
          <p className={styles.subtitle}>Token-gated overview of AI daily signals, reasoning and paper-trade evaluation.</p>
        </div>

        <div className={styles.headerActions}>
          <button className={styles.refreshButton} onClick={() => void loadData()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <label className={styles.toggleLabel}>
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            Auto {autoRefresh ? `${countdown}s` : "off"}
          </label>
          <p className={styles.updatedText}>Updated CET: {lastRefresh ? formatDateTime(lastRefresh.toISOString()) : "—"}</p>
        </div>
      </header>

      {error ? <section className={styles.errorBox}>{error}</section> : null}

      <section className={styles.metricsGrid}>
        <MetricCard label="Latest run" value={data?.latestDate ?? "—"} detail="trade date" />
        <MetricCard label="Signals today" value={String(latest.length)} detail="tickers evaluated" />
        <MetricCard label="Open paper trades" value={String(openTrades.length)} detail="currently tracked" className={openTrades.length > 0 ? styles.warnText : undefined} />
        <MetricCard label="Closed trades" value={performance?.closed_count ?? "0"} detail="paper exits" />
        <MetricCard label="Win rate" value={`${winRate(performance).toFixed(1)}%`} detail="closed paper trades" />
        <MetricCard label="Avg realized PnL" value={formatPct(performance?.avg_realized_pnl_pct, 4)} detail="closed paper trades" className={classForPnl(performance?.avg_realized_pnl_pct)} />
        <MetricCard label="Best trade" value={formatPct(performance?.best_trade_pct, 4)} detail="realized" className={classForPnl(performance?.best_trade_pct)} />
        <MetricCard label="Worst trade" value={formatPct(performance?.worst_trade_pct, 4)} detail="realized" className={classForPnl(performance?.worst_trade_pct)} />
        <MetricCard label="Evaluated" value={performance?.evaluated_count ?? "0"} detail="daily outcomes" />
        <MetricCard label="Evaluation hit rate" value={`${formatNumber(performance?.evaluation_hit_rate_pct, 1)}%`} detail="LONG/SHORT only" />
      </section>

      <section className={styles.panelFull}>
        <div className={styles.panelTitleRow}>
          <h2>Current Signals</h2>
          <span>Generated: {formatDateTime(data?.generatedAt)}</span>
        </div>
        <div className={styles.signalGrid}>
          {latest.length === 0 ? (
            <div className={styles.emptyBox}>No sentiment predictions yet.</div>
          ) : latest.map((prediction) => (
            <article key={prediction.run_id} className={styles.signalCard}>
              <div className={styles.signalHeader}>
                <strong>{prediction.ticker}</strong>
                <span className={classForDecision(prediction.decision)}>{prediction.decision}</span>
              </div>
              <div className={styles.probabilityBar} aria-label={`${prediction.ticker} probabilities`}>
                <span style={{ width: `${toNumber(prediction.up_probability) ?? 0}%` }} className={styles.upBar} />
                <span style={{ width: `${toNumber(prediction.sideways_probability) ?? 0}%` }} className={styles.sideBar} />
                <span style={{ width: `${toNumber(prediction.down_probability) ?? 0}%` }} className={styles.downBar} />
              </div>
              <div className={styles.signalStats}>
                <div><span>Up</span><strong className={styles.goodText}>{formatPct(prediction.up_probability)}</strong></div>
                <div><span>Side</span><strong>{formatPct(prediction.sideways_probability)}</strong></div>
                <div><span>Down</span><strong className={styles.badText}>{formatPct(prediction.down_probability)}</strong></div>
                <div><span>Conf</span><strong>{formatConfidence(prediction.confidence)}</strong></div>
              </div>
              <small>Entry/reference: {formatNumber(prediction.entry_price ?? prediction.reference_price, 6)}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.panelFull}>
        <div className={styles.panelTitleRow}>
          <h2>Open Paper Trades</h2>
          <span>{openTrades.length} active</span>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Side</th>
                <th>Entry</th>
                <th>Current</th>
                <th>Current PnL</th>
                <th>Max Profit</th>
                <th>Max Loss</th>
                <th>Opened CET</th>
              </tr>
            </thead>
            <tbody>
              {openTrades.length === 0 ? (
                <tr><td colSpan={8} className={styles.emptyCell}>No open paper trades.</td></tr>
              ) : openTrades.map((trade) => (
                <tr key={trade.id}>
                  <td>{trade.ticker}</td>
                  <td className={classForDecision(trade.decision)}>{trade.decision}</td>
                  <td>{formatNumber(trade.entry_price, 6)}</td>
                  <td>{formatNumber(trade.current_price, 6)}</td>
                  <td className={classForPnl(trade.current_pnl_pct)}>{formatPct(trade.current_pnl_pct, 4)}</td>
                  <td className={classForPnl(trade.max_profit_pct)}>{formatPct(trade.max_profit_pct, 4)}</td>
                  <td className={classForPnl(trade.max_loss_pct)}>{formatPct(trade.max_loss_pct, 4)}</td>
                  <td>{formatDateTime(trade.opened_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panelFull}>
        <div className={styles.panelTitleRow}>
          <h2>AI Reasoning</h2>
          <span>Latest run</span>
        </div>
        <div className={styles.reasoningGrid}>
          {latest.map((prediction) => {
            const reasoning = extractReasoning(prediction);
            return (
              <details key={prediction.run_id} className={styles.reasoningCard} open={prediction.decision !== "NO_TRADE"}>
                <summary>
                  <strong>{prediction.ticker}</strong>
                  <span className={classForDecision(prediction.decision)}>{prediction.decision}</span>
                  <span>{formatConfidence(prediction.confidence)}</span>
                </summary>
                <p>{reasoning.summary}</p>
                {reasoning.bullish.length > 0 ? (
                  <div>
                    <h3>Bullish factors</h3>
                    <ul>{reasoning.bullish.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                ) : null}
                {reasoning.bearish.length > 0 ? (
                  <div>
                    <h3>Bearish factors</h3>
                    <ul>{reasoning.bearish.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                ) : null}
                {reasoning.risks.length > 0 ? (
                  <div>
                    <h3>Risks</h3>
                    <ul>{reasoning.risks.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                ) : null}
                <details className={styles.rawJsonBlock}>
                  <summary>Raw JSON</summary>
                  <pre>{JSON.stringify(reasoning.raw, null, 2)}</pre>
                </details>
              </details>
            );
          })}
        </div>
      </section>

      <section className={styles.panelFull}>
        <div className={styles.panelTitleRow}>
          <h2>Daily History</h2>
          <select value={selectedTicker} onChange={(event) => setSelectedTicker(event.target.value)} className={styles.selectInput}>
            {tickers.map((ticker) => <option key={ticker} value={ticker}>{ticker}</option>)}
          </select>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Ticker</th>
                <th>Decision</th>
                <th>Up</th>
                <th>Side</th>
                <th>Down</th>
                <th>Conf</th>
                <th>Status</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr><td colSpan={9} className={styles.emptyCell}>No history yet.</td></tr>
              ) : filteredHistory.slice(0, 100).map((row) => (
                <tr key={row.run_id}>
                  <td>{row.trade_date}</td>
                  <td>{row.ticker}</td>
                  <td className={classForDecision(row.decision)}>{row.decision}</td>
                  <td className={styles.goodText}>{formatPct(row.up_probability)}</td>
                  <td>{formatPct(row.sideways_probability)}</td>
                  <td className={styles.badText}>{formatPct(row.down_probability)}</td>
                  <td>{formatConfidence(row.confidence)}</td>
                  <td>{row.status ?? "—"}</td>
                  <td>{formatNumber(row.reference_price, 6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panelFull}>
        <div className={styles.panelTitleRow}>
          <h2>Daily Evaluation</h2>
          <span>{evaluations.length} evaluated predictions</span>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Ticker</th>
                <th>Decision</th>
                <th>Reference</th>
                <th>Eval price</th>
                <th>Result</th>
                <th>Outcome</th>
                <th>Hit</th>
                <th>Evaluated CET</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.length === 0 ? (
                <tr><td colSpan={9} className={styles.emptyCell}>No evaluated daily predictions yet.</td></tr>
              ) : evaluations.slice(0, 120).map((row) => (
                <tr key={row.id}>
                  <td>{row.trade_date}</td>
                  <td>{row.ticker}</td>
                  <td className={classForDecision(row.decision)}>{row.decision}</td>
                  <td>{formatNumber(row.reference_price, 6)}</td>
                  <td>{formatNumber(row.evaluation_price, 6)}</td>
                  <td className={classForPnl(row.result_pct)}>{formatPct(row.result_pct, 4)}</td>
                  <td>{row.actual_outcome ?? "—"}</td>
                  <td className={row.hit === true ? styles.goodText : row.hit === false ? styles.badText : styles.mutedText}>{row.hit === null ? "—" : row.hit ? "yes" : "no"}</td>
                  <td>{formatDateTime(row.evaluated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panelFull}>
        <div className={styles.panelTitleRow}>
          <h2>Closed Paper Trades</h2>
          <span>{closedTrades.length} closed</span>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Side</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>Realized PnL</th>
                <th>Max Profit</th>
                <th>Max Loss</th>
                <th>Closed CET</th>
              </tr>
            </thead>
            <tbody>
              {closedTrades.length === 0 ? (
                <tr><td colSpan={8} className={styles.emptyCell}>No closed paper trades yet.</td></tr>
              ) : closedTrades.slice(0, 100).map((trade) => (
                <tr key={trade.id}>
                  <td>{trade.ticker}</td>
                  <td className={classForDecision(trade.decision)}>{trade.decision}</td>
                  <td>{formatNumber(trade.entry_price, 6)}</td>
                  <td>{formatNumber(trade.exit_price, 6)}</td>
                  <td className={classForPnl(trade.realized_pnl_pct)}>{formatPct(trade.realized_pnl_pct, 4)}</td>
                  <td className={classForPnl(trade.max_profit_pct)}>{formatPct(trade.max_profit_pct, 4)}</td>
                  <td className={classForPnl(trade.max_loss_pct)}>{formatPct(trade.max_loss_pct, 4)}</td>
                  <td>{formatDateTime(trade.closed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className={styles.footerNote}>
        Paper-only monitoring. This page displays model output and simulated trade tracking; it does not place real orders.
      </footer>
    </main>
  );
}
