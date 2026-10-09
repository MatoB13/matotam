"use client";

import { useCallback, useEffect, useState } from "react";
import { actionHeaders } from "./actionPassword";
import styles from "./dolz.module.css";
import type { DolzAuctionStatus } from "@/app/lib/dolzSniper";

const DEFAULT_AUCTION = "https://dolz.io/auction/0x9e8c5bb7a649a77e80E04300916cD85f3304bb69";

function formatUsd(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `$${value.toFixed(2)}`;
}

function countdown(seconds: number): string {
  if (seconds <= 0) return "skončila";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return d ? `${d} d ${h} h ${m} min` : h ? `${h} h ${m} min ${s} s` : `${m} min ${s} s`;
}

/** Keep the hot wallet's bid on the last winning place of one auction rarity, up to a maximum. */
export default function AuctionPanel({ token }: { token: string }) {
  const [data, setData] = useState<DolzAuctionStatus | null>(null);
  const [link, setLink] = useState(DEFAULT_AUCTION);
  const [rarity, setRarity] = useState(1);
  const [maxUsd, setMaxUsd] = useState("");
  const [step, setStep] = useState("1");
  const [stepPct, setStepPct] = useState("");
  const [finalExtra, setFinalExtra] = useState("2");
  const [enabled, setEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [clock, setClock] = useState(0);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&view=auction`, { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; auction?: DolzAuctionStatus; error?: string };
      if (!response.ok || !json.ok || !json.auction) throw new Error(json.error || `HTTP ${response.status}`);
      // A sniper not yet updated answers with a single config/status.
      const legacy = json.auction as DolzAuctionStatus & { config?: DolzAuctionStatus["configs"][number] | null; status?: DolzAuctionStatus["statuses"][number] | null };
      setData({
        ...json.auction,
        configs: json.auction.configs ?? (legacy.config ? [legacy.config] : []),
        statuses: json.auction.statuses ?? (legacy.status ? [legacy.status] : []),
      });
      setClock(Date.now());
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Aukciu sa nepodarilo načítať." });
    }
  }, [token]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), 5_000);
    const tick = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, [load]);

  // Each rarity has its own saved settings; fill the form from the selected one until the user edits it.
  const configs = data?.configs ?? [];
  const config = configs.find((item) => item.rarity === rarity) ?? null;
  useEffect(() => {
    if (dirty) return;
    const id = window.setTimeout(() => {
      if (config) setLink(`https://dolz.io/auction/${config.contract}`);
      setMaxUsd(config ? String(config.max_usd) : "");
      setStep(config ? String(config.increment_usd) : "1");
      setStepPct(config?.increment_pct ? String(config.increment_pct) : "");
      setFinalExtra(config ? String(config.final_extra_usd ?? 0) : "2");
      setEnabled(config ? config.enabled : true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [config, dirty]);

  const save = async (nextEnabled = enabled) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&action=auction`, {
        method: "POST",
        headers: { "content-type": "application/json", ...actionHeaders() },
        body: JSON.stringify({
          contract: link,
          rarity,
          max_usd: Number(maxUsd),
          increment_usd: Number(step),
          increment_pct: Number(stepPct) || 0,
          final_extra_usd: Number(finalExtra) || 0,
          enabled: nextEnabled,
        }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || `HTTP ${response.status}`);
      setDirty(false);
      setEnabled(nextEnabled);
      setMessage({ ok: true, text: nextEnabled ? "Uložené, sniper aukciu sleduje a prihadzuje." : "Uložené, prihadzovanie je vypnuté." });
      void load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Uloženie zlyhalo." });
    } finally {
      setSaving(false);
    }
  };

  const claimNow = async () => {
    const contract = config?.contract ?? configs[configs.length - 1]?.contract;
    if (!contract) return;
    setClaiming(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&action=auction_claim`, {
        method: "POST",
        headers: { "content-type": "application/json", ...actionHeaders() },
        body: JSON.stringify({ contract }),
      });
      const json = (await response.json()) as { ok: boolean; claim?: { state: string; message: string }; error?: string };
      if (!response.ok || !json.ok || !json.claim) throw new Error(json.error || `HTTP ${response.status}`);
      setMessage({ ok: json.claim.state === "done", text: json.claim.message });
      void load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Výber zlyhal." });
    } finally {
      setClaiming(false);
    }
  };

  const claim = (data?.claims ?? []).find((item) => item.contract === (config?.contract ?? configs[configs.length - 1]?.contract)) ?? null;
  const status = (data?.statuses ?? []).find((item) => item.rarity === rarity) ?? null;
  const settings = data?.settings;
  const rarities = data?.rarities ?? ["Legendary", "Epic", "Rare", "Limited"];
  const nowSec = (clock || 0) / 1000;
  const end = settings?.end[rarity];
  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  return (
    <section className={styles.panelFull}>
      <div className={styles.panelTitleRow}>
        <h2>Aukcia</h2>
        <span>{end ? `${rarities[rarity]} končí o ${countdown(end - nowSec)} (${new Date(end * 1000).toLocaleString("sk-SK")})` : ""}</span>
      </div>
      <p className={styles.chartNote}>
        Sniper drží ponuku hot walletu na predposlednom víťaznom mieste. Keď ju niekto predbehne, prihodí o krok viac, nikdy nad tvoje maximum. Kontrakt
        pritom vyžaduje navýšenie vlastnej ponuky aspoň o 10 %, preto nastav maximum s rezervou. Prihadzuje len rarita, ktorá končí najskôr; posledných 20
        minút kontroluje každú sekundu a v posledných 30 sekundách pridá rezervu (30s +$). Výhry a vrátené peniaze vyberie po aukcii sám do hot walletu.
      </p>
      <div className={styles.sellBulk}>
        <span className={claim?.state === "done" ? styles.goodText : styles.mutedText}>
          Výhry: {claim ? `${claim.message}${claim.token_ids?.length ? ` Karty ${claim.token_ids.join(", ")}.` : ""}${claim.refund_usd ? ` Vrátené ${formatUsd(claim.refund_usd)}.` : ""}` : "po skončení aukcie ich bot vyberie sám."}
          {claim?.tx ? (
            <>
              {" "}
              <a href={`https://polygonscan.com/tx/${claim.tx}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                transakcia
              </a>
            </>
          ) : null}
        </span>
        <button type="button" className={styles.primaryButton} onClick={() => void claimNow()} disabled={claiming || !configs.length || claim?.state === "done"}>
          {claiming ? "Vyberám…" : "Vybrať výhry"}
        </button>
      </div>
      <div className={styles.sellBulk}>
        <input className={styles.quickBuyInput} aria-label="Odkaz na aukciu" value={link} onChange={(event) => edit(setLink)(event.target.value)} />
        <select
          aria-label="Rarita"
          value={rarity}
          onChange={(event) => {
            setRarity(Number(event.target.value));
            setDirty(false); // load the chosen rarity's own settings
          }}
        >
          {rarities.map((name, index) => (
            <option key={name} value={index}>
              {name}
              {settings ? ` (${settings.supply[index]} ks, od ${formatUsd(settings.min_raw[index] / 1e6)})` : ""}
            </option>
          ))}
        </select>
        <label className={styles.moneyInput} title="Viac nikdy neprihodí">
          <span>$</span>
          <input type="number" min="1" step="1" placeholder="maximum" aria-label="Maximum v USD" value={maxUsd} onChange={(event) => edit(setMaxUsd)(event.target.value)} />
        </label>
        <label className={styles.moneyInput} title="O koľko prebije posledné víťazné miesto">
          <span>+$</span>
          <input type="number" min="0.01" step="0.5" aria-label="Krok v USD" value={step} onChange={(event) => edit(setStep)(event.target.value)} />
        </label>
        <label className={styles.moneyInput} title="Krok v percentách z posledného víťazného miesta; platí väčší z oboch">
          <span>+%</span>
          <input type="number" min="0" step="1" placeholder="alebo %" aria-label="Krok v percentách" value={stepPct} onChange={(event) => edit(setStepPct)(event.target.value)} />
        </label>
        <label className={styles.moneyInput} title="Navyše ku kroku v posledných 30 sekundách">
          <span>30s +$</span>
          <input
            type="number"
            min="0"
            step="0.5"
            aria-label="Rezerva v posledných 30 sekundách v USD"
            value={finalExtra}
            onChange={(event) => edit(setFinalExtra)(event.target.value)}
            style={{ paddingLeft: 52 }}
          />
        </label>
        <button type="button" className={styles.primaryButton} disabled={saving || !(Number(maxUsd) > 0)} onClick={() => void save(true)}>
          {saving ? "Ukladám…" : config?.enabled && !dirty ? "Uložiť zmeny" : "Zapnúť prihadzovanie"}
        </button>
        {config?.enabled ? (
          <button type="button" className={styles.refreshButton} disabled={saving} onClick={() => void save(false)}>
            Vypnúť
          </button>
        ) : null}
      </div>
      {message ? <p className={message.ok ? styles.goodText : styles.badText}>{message.text}</p> : null}
      {configs.length ? (
        <ul className={styles.ruleList}>
          {configs.map((item) => {
            const itemStatus = (data?.statuses ?? []).find((entry) => entry.rarity === item.rarity);
            return (
              <li key={`${item.contract}-${item.rarity}`}>
                <button type="button" className={styles.linkButton} onClick={() => { setRarity(item.rarity); setDirty(false); }}>
                  {rarities[item.rarity] ?? item.rarity}
                </button>
                {": "}
                {item.enabled ? "prihadzuje" : "vypnuté"} · max {formatUsd(item.max_usd)}
                {itemStatus?.ours
                  ? ` · moja ponuka ${formatUsd(itemStatus.ours.amount / 1e6)}${itemStatus.position ? `, ${itemStatus.position}./${itemStatus.supply}` : ""}`
                  : " · zatiaľ bez ponuky"}
              </li>
            );
          })}
        </ul>
      ) : null}

      {status && status.rarity === rarity ? (
        <>
          <div className={styles.metricsGrid}>
            <article className={styles.metricCard}>
              <span>Posledné víťazné miesto ({status.supply}.)</span>
              <strong>{status.cutoff_raw != null ? formatUsd(status.cutoff_raw / 1e6) : "voľné"}</strong>
              <small>{status.bids} ponúk na {status.supply} kariet</small>
            </article>
            <article className={styles.metricCard}>
              <span>Moja ponuka</span>
              <strong className={status.winning ? styles.goodText : status.ours ? styles.badText : undefined}>{status.ours ? formatUsd(status.ours.amount / 1e6) : "—"}</strong>
              <small>{status.ours ? (status.position ? `${status.position}. miesto · ${status.winning ? "vyhráva" : "mimo víťazných miest"}` : "") : "zatiaľ žiadna"}</small>
            </article>
            <article className={styles.metricCard}>
              <span>Treba na miesto</span>
              <strong>{formatUsd(status.target_raw / 1e6)}</strong>
              <small>maximum {formatUsd(status.max_usd)}</small>
            </article>
            <article className={styles.metricCard}>
              <span>Stav</span>
              <strong className={status.enabled ? styles.goodText : styles.mutedText}>{status.enabled ? "prihadzuje" : "vypnuté"}</strong>
              <small>aktualizované {new Date(status.updated * 1000).toLocaleTimeString("sk-SK")}</small>
            </article>
          </div>
          <div className={`${styles.tableWrap} ${styles.scrollBox}`}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th className={styles.num}>Ponuka</th>
                  <th>Kto</th>
                  <th>Čas</th>
                </tr>
              </thead>
              <tbody>
                {status.top.map((bid, index) => (
                  <tr key={`${bid.bidder}-${index}`} className={index + 1 === status.supply ? styles.sellSelected : undefined}>
                    <td className={index + 1 > status.supply ? styles.mutedText : undefined}>{index + 1}</td>
                    <td className={styles.num}>{formatUsd(bid.amount_usd)}</td>
                    <td>
                      {status.ours && status.position === index + 1 ? <strong className={styles.goodText}>ja (hot wallet)</strong> : `${bid.bidder.slice(0, 6)}…${bid.bidder.slice(-4)}`}
                    </td>
                    <td>{new Date(bid.ts * 1000).toLocaleString("sk-SK")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className={styles.chartNote}>{config ? "Načítavam stav aukcie…" : "Zadaj maximum a zapni prihadzovanie; poradie sa zobrazí po prvom načítaní."}</p>
      )}
    </section>
  );
}
