"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../dolz/dolz.module.css";
import type { LedgerRow, PnlGroup, Portfolio, WalletDetail, WalletSummary } from "@/app/lib/walletLedger";

const KIND_LABELS: Record<string, string> = {
  buy: "Nákup",
  sell: "Predaj",
  list: "Ponuka na predaj",
  delist: "Zrušená ponuka",
  market: "Marketplace",
  receive: "Prijaté",
  send: "Odoslané",
  "own-transfer": "Prevod medzi mojimi",
  internal: "Interná (konsolidácia)",
  mint: "Mint",
  burn: "Burn",
  staking: "Staking",
  dex: "DEX / LP pool",
  lending: "Požičiavanie",
  script: "Skript / iné",
};

type Tab = "overview" | "holdings" | "ledger" | "staking";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Prehľad" },
  { id: "holdings", label: "Držba" },
  { id: "ledger", label: "Operácie" },
  { id: "staking", label: "Staking a pooly" },
];
const PAGE_SIZE = 100;

const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;
const displayName = (w: Pick<WalletSummary, "label" | "handles">) =>
  w.handles.length ? w.handles.map((h) => `$${h}`).join(", ") : w.label;

function formatAda(value: number, signed = false): string {
  const sign = signed && value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₳`;
}
const formatInt = (value: number) => value.toLocaleString("en-US");
const formatDate = (unix: number | null) =>
  unix ? new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(unix * 1000)) : "—";
const pnlClass = (value: number) => (Math.abs(value) < 0.005 ? undefined : value > 0 ? styles.goodText : styles.badText);
const shortHash = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;

function MetricCard({ label, value, detail, className }: { label: string; value: string; detail?: string; className?: string }) {
  return (
    <article className={styles.metricCard}>
      <span>{label}</span>
      <strong className={className}>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

type SortKey = "trades" | "realized" | "spent" | "roi" | "held" | "last";
const SORTS: { id: SortKey; label: string }[] = [
  { id: "trades", label: "Počet obchodov" },
  { id: "realized", label: "Realizovaný PNL" },
  { id: "spent", label: "Investované" },
  { id: "roi", label: "ROI" },
  { id: "held", label: "V držbe (cena)" },
  { id: "last", label: "Posledný obchod" },
];
const sortValue = (g: PnlGroup, key: SortKey): number => {
  switch (key) {
    case "trades": return g.trades;
    case "realized": return g.realized;
    case "spent": return g.spent;
    case "roi": return g.roi ?? -Infinity;
    case "held": return g.heldCost;
    case "last": return g.lastTime ?? 0;
  }
};
const formatPct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(0)} %`);

function PnlTable({ groups, kind }: { groups: PnlGroup[]; kind: "nft" | "ft" }) {
  const [sort, setSort] = useState<SortKey>("trades");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .filter((g) => !needle || g.name.toLowerCase().includes(needle) || g.policy.startsWith(needle))
      .sort((a, b) => sortValue(b, sort) - sortValue(a, sort));
  }, [groups, sort, query]);
  return (
    <section className={styles.panelFull}>
      <div className={styles.panelTitleRow}>
        <h2>{kind === "nft" ? "NFT kolekcie" : "Fungible tokeny"}</h2>
        <span>{rows.length} z {groups.length} · zoradené podľa: {SORTS.find((x) => x.id === sort)?.label}</span>
      </div>
      <div className={styles.subTabBar} style={{ marginBottom: 12, alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hľadať názov / policy…"
          style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        />
        {SORTS.map((x) => (
          <button key={x.id} type="button" className={sort === x.id ? styles.tabActive : styles.tab} onClick={() => setSort(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className={`${styles.tableWrap} ${styles.scrollBox}`} style={{ maxHeight: 640 }}>
        <table>
          <thead>
            <tr>
              <th>{kind === "nft" ? "Kolekcia" : "Token"}</th>
              <th className={styles.num}>Obchody</th>
              <th className={styles.num}>Nákupy / predaje</th>
              <th className={styles.num}>Mint</th>
              <th className={styles.num}>Investované</th>
              <th className={styles.num}>Z predajov</th>
              <th className={styles.num}>Realizovaný PNL</th>
              <th className={styles.num}>ROI</th>
              <th className={styles.num}>Úspešnosť</th>
              <th className={styles.num}>Ø držba</th>
              <th className={styles.num}>V držbe</th>
              <th>Posledný</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.key}>
                <td>
                  <a href={`https://cardanoscan.io/tokenPolicy/${g.policy}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                    {g.name}
                  </a>
                </td>
                <td className={styles.num}>{g.trades}</td>
                <td className={styles.num}>{g.buys} / {g.sells}</td>
                <td className={styles.num}>{g.mints || "—"}</td>
                <td className={styles.num}>{g.spent ? formatAda(g.spent) : "—"}</td>
                <td className={styles.num}>{g.proceeds ? formatAda(g.proceeds) : "—"}</td>
                <td className={`${styles.num} ${pnlClass(g.realized) ?? ""}`}>{g.sells ? formatAda(g.realized, true) : "—"}</td>
                <td className={`${styles.num} ${pnlClass(g.roi ?? 0) ?? ""}`}>{formatPct(g.roi)}</td>
                <td className={styles.num}>{g.winRate === null ? "—" : `${formatPct(g.winRate)} (${g.wins}/${g.wins + g.losses})`}</td>
                <td className={styles.num}>{g.avgHoldDays === null ? "—" : `${g.avgHoldDays.toFixed(0)} d`}</td>
                <td className={styles.num}>
                  {g.heldQty > 0 ? `${kind === "ft" ? formatInt(Math.round(g.heldQty)) : g.heldQty} · ${formatAda(g.heldCost)}` : "—"}
                </td>
                <td>{formatDate(g.lastTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BalanceChart({ series }: { series: { month: string; balance: number }[] }) {
  if (series.length < 2) return <div className={styles.emptyBox}>Málo dát na graf.</div>;
  const width = 720;
  const height = 220;
  const pad = { top: 14, right: 16, bottom: 26, left: 70 };
  const values = series.map((p) => p.balance);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => pad.left + ((width - pad.left - pad.right) * i) / (series.length - 1);
  const y = (v: number) => pad.top + (height - pad.top - pad.bottom) * (1 - (v - min) / span);
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const ticks = [min, min + span / 2, max];
  const labelStep = Math.max(1, Math.ceil(series.length / 8));
  return (
    <div className={styles.chartBox}>
      <div className={styles.chartHeader}>
        <h3>Zostatok ADA v čase</h3>
      </div>
      <div className={styles.chartFrame}>
        <svg viewBox={`0 0 ${width} ${height}`} className={styles.chartSvg} role="img" aria-label="Zostatok ADA v čase">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className={styles.gridLine} />
              <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className={styles.axisText}>
                {Math.round(t).toLocaleString("en-US")}
              </text>
            </g>
          ))}
          <path d={path} fill="none" stroke="#3987e5" strokeWidth="2" />
          {series.map((p, i) =>
            i % labelStep === 0 ? (
              <text key={p.month} x={x(i)} y={height - 8} textAnchor="middle" className={styles.axisText}>
                {p.month.slice(2)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </div>
  );
}

function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  if (!rows.length) return <div className={styles.emptyBox}>Žiadne operácie.</div>;
  return (
    <div className={`${styles.tableWrap} ${styles.scrollBox}`}>
      <table>
        <thead>
          <tr>
            <th>Dátum</th>
            <th>Typ</th>
            <th className={styles.num}>ADA</th>
            <th className={styles.num}>NFT +/−</th>
            <th>Tokeny</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.txHash}>
              <td>{formatDate(row.time)}</td>
              <td>
                {kindLabel(row.kind)}
                {row.protocol ? <span className={styles.mutedText}> · {row.protocol}</span> : null}
              </td>
              <td className={`${styles.num} ${pnlClass(row.ada) ?? ""}`}>{formatAda(row.ada, true)}</td>
              <td className={styles.num}>
                {row.nftIn || row.nftOut ? (
                  <>
                    {row.nftIn ? <span className={styles.goodText}>+{row.nftIn}</span> : null}
                    {row.nftIn && row.nftOut ? " / " : null}
                    {row.nftOut ? <span className={styles.badText}>−{row.nftOut}</span> : null}
                    {row.sampleNft && row.nftIn + row.nftOut === 1 ? <span className={styles.mutedText}> {row.sampleNft}</span> : null}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {row.tokens.length
                  ? row.tokens.map((t) => `${t.qty > 0 ? "+" : "−"}${formatInt(Math.abs(t.qty))} ${t.name}`).join(", ")
                  : "—"}
              </td>
              <td>
                <a href={`https://cardanoscan.io/transaction/${row.txHash}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                  {shortHash(row.txHash)}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function WalletsDashboard({ token }: { token: string }) {
  const [wallets, setWallets] = useState<WalletSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<WalletDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [kind, setKind] = useState("all");
  const [extraRows, setExtraRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [top, setTop] = useState<"wallets" | "nft" | "ft">("wallets");
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);

  const authed = useCallback(async (url: string) => {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const body = (await response.json()) as { ok: boolean; data?: unknown; error?: string };
    if (!response.ok || !body.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    return body.data;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authed("/api/wallets")
      .then((data) => !cancelled && setWallets(data as WalletSummary[]))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [authed]);

  useEffect(() => {
    if (top === "wallets" || portfolio) return;
    let cancelled = false;
    setLoading(true);
    authed("/api/wallets/portfolio")
      .then((data) => !cancelled && setPortfolio(data as Portfolio))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [top, portfolio, authed]);

  const loadDetail = useCallback(
    async (stake: string, nextKind: string) => {
      setLoading(true);
      setError(null);
      setExtraRows([]);
      try {
        const data = await authed(`/api/wallets/${stake}?kind=${nextKind}&limit=${PAGE_SIZE}`);
        setDetail(data as WalletDetail);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chyba");
      } finally {
        setLoading(false);
      }
    },
    [authed],
  );

  useEffect(() => {
    if (selected) void loadDetail(selected, kind);
  }, [selected, kind, loadDetail]);

  const loadMore = async () => {
    if (!selected || !detail) return;
    setLoading(true);
    try {
      const offset = detail.ledger.length + extraRows.length;
      const data = (await authed(`/api/wallets/${selected}?kind=${kind}&limit=${PAGE_SIZE}&offset=${offset}`)) as WalletDetail;
      setExtraRows((prev) => [...prev, ...data.ledger]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    const list = wallets ?? [];
    return {
      count: list.length,
      txs: list.reduce((s, w) => s + w.txs, 0),
      nfts: list.reduce((s, w) => s + w.nfts, 0),
      fts: list.reduce((s, w) => s + w.fts, 0),
      ada: list.reduce((s, w) => s + w.adaBalance, 0),
    };
  }, [wallets]);

  const allLedger = detail ? [...detail.ledger, ...extraRows] : [];
  const stakingKinds = ["staking", "dex", "lending"];

  return (
    <main className={styles.pageShell}>
      <div className={styles.backgroundGlow} />
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>matotam.io private monitor</p>
          <h1 className={styles.title}>
            PENAŽENKY <span>LEDGER</span>
          </h1>
          <p className={styles.subtitle}>
            Nákupy, predaje, prevody, NFT a tokeny, staking, pooly a požičiavanie — z on-chain histórie sledovaných Cardano walletov.
          </p>
        </div>
        <div className={styles.headerActions}>
          {selected ? (
            <button className={styles.refreshButton} onClick={() => { setSelected(null); setDetail(null); setTab("overview"); setKind("all"); }}>
              ← Všetky peňaženky
            </button>
          ) : null}
        </div>
      </header>

      {error ? <section className={styles.errorBox}>{error}</section> : null}
      {loading && !wallets && !detail ? <section className={styles.loadingBox}>Načítavam…</section> : null}

      {!selected && wallets ? (
        <>
          <nav className={styles.tabBar} role="tablist" aria-label="Sekcie">
            {([["wallets", "Peňaženky"], ["nft", "NFT"], ["ft", "FT"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={top === id} className={top === id ? styles.tabActive : styles.tab} onClick={() => setTop(id)}>
                {label}
              </button>
            ))}
          </nav>
          <section className={styles.metricsGrid}>
            <MetricCard label="Peňaženky" value={String(totals.count)} detail={`${formatInt(totals.txs)} transakcií`} />
            <MetricCard label="NFT v držbe" value={formatInt(totals.nfts)} detail={`${formatInt(totals.fts)} fungible tokenov`} />
            <MetricCard label="ADA spolu" value={formatAda(totals.ada)} />
            <MetricCard
              label="Realizovaný PNL"
              value={portfolio ? formatAda(portfolio.totals.realized, true) : "—"}
              className={portfolio ? pnlClass(portfolio.totals.realized) : undefined}
              detail={portfolio ? `NFT ${formatAda(portfolio.totals.realizedNft, true)} · FT ${formatAda(portfolio.totals.realizedFt, true)}` : "otvor záložku NFT alebo FT"}
            />
          </section>
          {top !== "wallets" && portfolio ? (
            <section className={styles.metricsGrid}>
              <MetricCard label="Investované (nákupy)" value={formatAda(portfolio.totals.spent)} />
              <MetricCard label="Tržby z predajov" value={formatAda(portfolio.totals.proceeds)} />
              <MetricCard label="Úspešnosť predajov" value={formatPct(portfolio.totals.winRate)} detail="predaje v pluse" />
              <MetricCard label="V držbe (nákupná cena)" value={formatAda(portfolio.totals.heldCost)} />
            </section>
          ) : null}
          {top !== "wallets" && portfolio && !portfolio.ready ? (
            <section className={styles.loadingBox}>PNL sa ešte počíta, indexer dopĺňa históriu. Skús o pár minút.</section>
          ) : null}
          {top === "nft" && portfolio?.ready ? <PnlTable groups={portfolio.nft} kind="nft" /> : null}
          {top === "ft" && portfolio?.ready ? <PnlTable groups={portfolio.ft} kind="ft" /> : null}
          {top === "wallets" ? <section className={styles.panelFull}>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Peňaženka</th>
                    <th className={styles.num}>ADA</th>
                    <th className={styles.num}>NFT</th>
                    <th className={styles.num}>FT</th>
                    <th className={styles.num}>Tx</th>
                    <th className={styles.num}>Nákupy</th>
                    <th className={styles.num}>Predaje</th>
                    <th className={styles.num}>Prevody</th>
                    <th>Aktivita</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((w) => (
                    <tr key={w.stake} onClick={() => setSelected(w.stake)} style={{ cursor: "pointer" }}>
                      <td>
                        <strong>{displayName(w)}</strong>
                        {w.handles.length ? <span className={styles.mutedText}> · {w.label}</span> : null}
                      </td>
                      <td className={styles.num}>{formatAda(w.adaBalance)}</td>
                      <td className={styles.num}>{formatInt(w.nfts)}</td>
                      <td className={styles.num}>{formatInt(w.fts)}</td>
                      <td className={styles.num}>{formatInt(w.txs)}</td>
                      <td className={styles.num}>{w.kinds.buy ?? "—"}</td>
                      <td className={styles.num}>{w.kinds.sell ?? "—"}</td>
                      <td className={styles.num}>{(w.kinds.receive ?? 0) + (w.kinds.send ?? 0) + (w.kinds["own-transfer"] ?? 0) || "—"}</td>
                      <td>
                        {formatDate(w.firstTime)} – {formatDate(w.lastTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section> : null}
        </>
      ) : null}

      {selected && detail ? (
        <>
          <h2 style={{ position: "relative", zIndex: 1, margin: "0 0 14px" }}>
            {displayName(detail.summary)}
            <span className={styles.mutedText}> · {detail.summary.label}</span>
          </h2>
          <nav className={styles.tabBar} role="tablist" aria-label="Sekcie">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? styles.tabActive : styles.tab} onClick={() => { setTab(t.id); setKind(t.id === "staking" ? "staking" : "all"); }}>
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "overview" ? (
            <>
              <section className={styles.metricsGrid}>
                <MetricCard label="Zostatok ADA" value={formatAda(detail.summary.adaBalance)} />
                <MetricCard label="Transakcie" value={formatInt(detail.summary.txs)} detail={`${formatDate(detail.summary.firstTime)} – ${formatDate(detail.summary.lastTime)}`} />
                <MetricCard label="NFT v držbe" value={formatInt(detail.summary.nfts)} detail={`${detail.summary.policies} policy`} />
                <MetricCard label="Fungible tokeny" value={formatInt(detail.summary.fts)} />
              </section>
              <BalanceChart series={detail.series} />
              <section className={styles.panelFull}>
                <div className={styles.panelTitleRow}>
                  <h2>Podľa typu operácie</h2>
                  <span>ADA príjmy / výdavky a počet presunutých NFT</span>
                </div>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Typ</th>
                        <th className={styles.num}>Počet</th>
                        <th className={styles.num}>ADA príjem</th>
                        <th className={styles.num}>ADA výdavok</th>
                        <th className={styles.num}>NFT dnu</th>
                        <th className={styles.num}>NFT von</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.stats.map((s) => (
                        <tr key={s.kind}>
                          <td>{kindLabel(s.kind)}</td>
                          <td className={styles.num}>{formatInt(s.count)}</td>
                          <td className={`${styles.num} ${styles.goodText}`}>{s.adaIn ? formatAda(s.adaIn) : "—"}</td>
                          <td className={`${styles.num} ${styles.badText}`}>{s.adaOut ? formatAda(s.adaOut) : "—"}</td>
                          <td className={styles.num}>{s.nftIn || "—"}</td>
                          <td className={styles.num}>{s.nftOut || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}

          {tab === "holdings" ? (
            <>
              <section className={styles.panelFull}>
                <div className={styles.panelTitleRow}>
                  <h2>NFT podľa kolekcie (policy)</h2>
                  <span>{formatInt(detail.summary.nfts)} NFT v {detail.nftPolicies.length} kolekciách</span>
                </div>
                <div className={`${styles.tableWrap} ${styles.scrollBox}`}>
                  <table>
                    <thead>
                      <tr>
                        <th>Policy</th>
                        <th className={styles.num}>Počet</th>
                        <th>Ukážka</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.nftPolicies.map((p) => (
                        <tr key={p.policy}>
                          <td>
                            <a href={`https://cardanoscan.io/tokenPolicy/${p.policy}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                              {p.policy.slice(0, 10)}…
                            </a>
                          </td>
                          <td className={styles.num}>{p.count}</td>
                          <td>{p.names.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className={styles.panelFull}>
                <div className={styles.panelTitleRow}>
                  <h2>Fungible tokeny</h2>
                  <span>{detail.tokens.length} druhov</span>
                </div>
                <div className={`${styles.tableWrap} ${styles.scrollBox}`}>
                  <table>
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th className={styles.num}>Množstvo (raw)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.tokens.map((t) => (
                        <tr key={t.unit}>
                          <td>{t.name}</td>
                          <td className={styles.num}>{formatInt(t.qty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}

          {tab === "ledger" || tab === "staking" ? (
            <section className={styles.panelFull}>
              {tab === "staking" ? (
                <div style={{ marginBottom: 14 }}>
                  {detail.delegation ? (
                    <section className={styles.metricsGrid}>
                      <MetricCard
                        label="Stake pool"
                        value={detail.delegation.poolTicker ? `[${detail.delegation.poolTicker}]` : detail.delegation.poolId ? shortHash(detail.delegation.poolId) : "—"}
                        detail={detail.delegation.status}
                      />
                      <MetricCard label="DRep" value={detail.delegation.drep ?? "—"} />
                      <MetricCard label="Dostupné odmeny" value={formatAda(detail.delegation.rewardsAvailable)} detail={`vybrané ${formatAda(detail.delegation.withdrawn)}`} />
                      <MetricCard label="Celkový zostatok" value={formatAda(detail.delegation.totalBalance)} />
                    </section>
                  ) : (
                    <div className={styles.emptyBox}>Aktuálna delegácia sa nepodarila načítať.</div>
                  )}
                  {detail.certEvents.length ? (
                    <div className={`${styles.tableWrap} ${styles.scrollBox}`} style={{ marginBottom: 14 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Dátum</th>
                            <th>Certifikát</th>
                            <th>Pool / DRep</th>
                            <th>Tx</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.certEvents.map((c, i) => (
                            <tr key={`${c.txHash}-${i}`}>
                              <td>{formatDate(c.time)}</td>
                              <td>{c.type}</td>
                              <td>{c.pool ? shortHash(c.pool) : c.drep ?? "—"}</td>
                              <td>
                                <a href={`https://cardanoscan.io/transaction/${c.txHash}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                                  {shortHash(c.txHash)}
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className={styles.panelTitleRow}>
                <h2>{tab === "staking" ? "Operácie: staking, pooly, požičiavanie" : "Všetky operácie"}</h2>
                <span>{formatInt(detail.ledgerTotal)} záznamov</span>
              </div>
              <div className={styles.subTabBar} style={{ marginBottom: 12 }}>
                {(tab === "staking" ? stakingKinds : ["all", ...detail.stats.map((s) => s.kind)]).map((k) => (
                  <button key={k} type="button" className={kind === k ? styles.tabActive : styles.tab} onClick={() => setKind(k)}>
                    {k === "all" ? "Všetko" : kindLabel(k)}
                  </button>
                ))}
              </div>
              <LedgerTable rows={allLedger} />
              {allLedger.length < detail.ledgerTotal ? (
                <p style={{ textAlign: "center", marginTop: 12 }}>
                  <button className={styles.refreshButton} onClick={() => void loadMore()} disabled={loading}>
                    {loading ? "Načítavam…" : `Načítať ďalšie (${allLedger.length} / ${detail.ledgerTotal})`}
                  </button>
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
