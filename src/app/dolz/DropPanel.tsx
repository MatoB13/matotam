"use client";

import { useCallback, useEffect, useState } from "react";
import { actionHeaders } from "./actionPassword";
import styles from "./dolz.module.css";
import { errorText, estimateGas, POLYGON, polygonFees, provider, short, waitForReceipt, word } from "./metamask";
import type { DolzDropConfig, DolzDropStatus } from "@/app/lib/dolzSniper";

const SEL_APPROVE = "0x095ea7b3";
const SEL_WL_MINT = "0xf2f3a93a"; // whitelist mint(qty, bytes32[] proof, amount)

function countdown(seconds: number): string {
  if (seconds <= 0) return "začal";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return d ? `${d} d ${h} h ${m} min` : h ? `${h} h ${m} min ${s} s` : `${m} min ${s} s`;
}

const when = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toLocaleString("sk-SK") : "—");

type Draft = { card: string; contract: string; max_qty: string; max_usd: string; max_tokens: string; priority_gwei: string };

const toDraft = (config: DolzDropConfig): Draft => ({
  card: config.card,
  contract: config.contract,
  max_qty: String(config.max_qty),
  max_usd: String(config.max_usd),
  max_tokens: String(config.max_tokens || ""),
  priority_gwei: String(config.priority_gwei),
});

/**
 * DOLZ direct sales: the sniper buys the public round from the hot wallet at the start; the owner's
 * whitelisted MetaMask wallet buys its own allocation here, signed in MetaMask.
 */
export default function DropPanel({ token }: { token: string }) {
  const [drop, setDrop] = useState<DolzDropStatus | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [clock, setClock] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&view=drop`, { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; drop?: DolzDropStatus; error?: string };
      if (!response.ok || !json.ok || !json.drop) throw new Error(json.error || `HTTP ${response.status}`);
      setDrop(json.drop);
      setClock(Date.now());
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Drop sa nepodarilo načítať." });
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

  // Fill the form from the saved settings until the user edits it.
  useEffect(() => {
    if (dirty || !drop?.config) return;
    const id = window.setTimeout(() => setDraft(toDraft(drop.config)), 0);
    return () => window.clearTimeout(id);
  }, [drop, dirty]);

  const save = async (enabled: boolean) => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&action=drop`, {
        method: "POST",
        headers: { "content-type": "application/json", ...actionHeaders() },
        body: JSON.stringify({
          enabled,
          card: draft.card,
          contract: draft.contract,
          max_qty: Number(draft.max_qty),
          max_usd: Number(draft.max_usd),
          max_tokens: Number(draft.max_tokens) || 0,
          priority_gwei: Number(draft.priority_gwei),
        }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || `HTTP ${response.status}`);
      setDirty(false);
      setMessage({ ok: true, text: enabled ? "Uložené, bot drop sleduje a v čase štartu kúpi." : "Uložené, bot drop nekúpi." });
      void load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Uloženie zlyhalo." });
    } finally {
      setSaving(false);
    }
  };

  /** Approve the payment token, then (or only) the whitelist purchase, both signed in MetaMask. */
  const metamask = async (wallet: string, action: "approve" | "buy") => {
    const eth = provider();
    if (!eth) {
      setMessage({ ok: false, text: "MetaMask sa v tomto prehliadači nenašiel." });
      return;
    }
    const contract = drop?.contract;
    const proof = drop?.proofs?.[wallet];
    const allocation = drop?.whitelist?.wallets?.[wallet] ?? 0;
    if (!contract || !drop?.token || !drop.price || drop.decimals == null || !proof || !allocation) {
      setMessage({ ok: false, text: "Kontrakt, cena alebo whitelist ešte nie sú známe." });
      return;
    }
    setBusy(`${wallet}:${action}`);
    setMessage(null);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts[0]?.toLowerCase();
      if (from !== wallet) throw new Error(`V MetaMasku je vybraný účet ${from ? short(from) : "—"}. Prepni na ${short(wallet)}.`);
      const chain = (await eth.request({ method: "eth_chainId" })) as string;
      if (chain.toLowerCase() !== POLYGON) await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: POLYGON }] });
      const qty = BigInt(allocation);
      const amount = qty * BigInt(drop.price);
      const tx =
        action === "approve"
          ? { from, to: drop.token, value: "0x0", data: SEL_APPROVE + word(contract) + word((amount * 10n ** BigInt(drop.decimals)).toString(16)) }
          : {
              from,
              to: contract,
              value: "0x0",
              data:
                SEL_WL_MINT +
                word(qty.toString(16)) +
                word("60") +
                word(amount.toString(16)) +
                word((proof.replace(/^0x/, "").length / 64).toString(16)) +
                proof.replace(/^0x/, ""),
            };
      // Estimating first shows the contract's reason (not started yet, missing approval…) before MetaMask opens.
      const gas = await estimateGas(eth, tx);
      const fees = await polygonFees(eth);
      setMessage({ ok: true, text: action === "approve" ? "Podpíš schválenie v MetaMasku…" : "Podpíš nákup v MetaMasku…" });
      const hash = (await eth.request({ method: "eth_sendTransaction", params: [{ ...tx, gas, ...fees }] })) as string;
      if (!(await waitForReceipt(eth, hash))) throw new Error(action === "approve" ? "Schválenie neprešlo." : "Nákup neprešiel.");
      setMessage({ ok: true, text: action === "approve" ? `${drop.symbol} je schválené, môžeš kúpiť.` : `Kúpené: ${allocation} ks z whitelistu.` });
      void load();
    } catch (error) {
      setMessage({ ok: false, text: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const nowSec = (clock || 0) / 1000;
  const start = drop?.start_at ?? drop?.planning?.planned ?? null;
  const config = drop?.config;
  const listed = Object.entries(drop?.whitelist?.wallets ?? {});
  const edit = (key: keyof Draft) => (event: { target: { value: string } }) => {
    setDraft((current) => (current ? { ...current, [key]: event.target.value } : current));
    setDirty(true);
  };
  const priceText = drop?.price ? `${drop.price} ${drop.symbol ?? ""}`.trim() : "—";

  return (
    <section className={styles.panelFull}>
      <div className={styles.panelTitleRow}>
        <h2>Drop</h2>
        <span>{start ? `štart o ${countdown(start - nowSec)} (${when(start)})` : ""}</span>
      </div>
      <p className={styles.chartNote}>
        Priamy predaj karty cez jej predajný kontrakt. Bot kúpi z hot walletu vo verejnom kole (alebo z whitelistu, ak je na ňom) toľko kusov, koľko
        kontrakt walletu dovolí, najviac tvoje maximum. Transakciu podpíše vopred, overí ju simuláciou a pošle hneď po poslednom bloku pred štartom.
        Platbu schváli kontraktu ešte pred štartom, preto musí byť na hot wallete dosť {drop?.symbol ?? "tokenov"} a POL na poplatky. Tvoj MetaMask kupuje
        z whitelistu nižšie, podpisuješ ty.
      </p>

      <div className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <span>Karta</span>
          <strong>{drop?.planning?.card ?? (config?.card || "—")}</strong>
          <small>{drop?.planning?.name ?? ""}</small>
        </article>
        <article className={styles.metricCard}>
          <span>Kontrakt</span>
          <strong>{drop?.contract ? short(drop.contract) : "zatiaľ nezverejnený"}</strong>
          <small>{drop?.state ?? (drop?.contract ? `${drop.symbol ?? ""} · limit ${drop.mint_cap ?? "?"} ks/wallet` : "DOLZ ho dopíše do plánu")}</small>
        </article>
        <article className={styles.metricCard}>
          <span>Cena za kartu</span>
          <strong>{priceText}</strong>
          <small>{drop?.contract ? (drop.price ? "overená simuláciou" : "zistí sa simuláciou") : ""}</small>
        </article>
        <article className={styles.metricCard}>
          <span>Hot wallet</span>
          <strong>
            {drop?.balance != null ? `${drop.balance.toLocaleString("sk-SK", { maximumFractionDigits: 2 })} ${drop.symbol ?? ""}` : "—"}
          </strong>
          <small>
            {drop?.pol != null ? `${drop.pol.toFixed(2)} POL · ` : ""}
            {drop?.qty != null ? `kúpi ${drop.qty} ks` : ""}
            {drop?.minted ? ` · už má ${drop.minted}` : ""}
          </small>
        </article>
      </div>

      {draft ? (
        <div className={styles.sellBulk}>
          <input className={styles.quickBuyInput} aria-label="Karta" placeholder={`karta (${drop?.planning?.card ?? "najbližšia"})`} value={draft.card} onChange={edit("card")} style={{ maxWidth: 160 }} />
          <input className={styles.quickBuyInput} aria-label="Kontrakt" placeholder="kontrakt (inak z plánu DOLZ)" value={draft.contract} onChange={edit("contract")} />
          <label className={styles.moneyInput} title="Najviac kusov; kontrakt môže dovoliť menej">
            <span>ks</span>
            <input type="number" min="1" max="10" step="1" aria-label="Najviac kusov" value={draft.max_qty} onChange={edit("max_qty")} />
          </label>
          <label className={styles.moneyInput} title="Najvyššia cena za kartu, keď sa platí v USDC/USDT">
            <span>$</span>
            <input type="number" min="1" step="1" aria-label="Najvyššia cena v USD" value={draft.max_usd} onChange={edit("max_usd")} />
          </label>
          <label className={styles.moneyInput} title="Najvyššia cena za kartu, keď sa platí v DOLZ">
            <span>DOLZ</span>
            <input type="number" min="0" step="10" placeholder="max" aria-label="Najvyššia cena v DOLZ" value={draft.max_tokens} onChange={edit("max_tokens")} style={{ paddingLeft: 52 }} />
          </label>
          <label className={styles.moneyInput} title="Poplatok za prednosť v bloku; boty minule platili do 1360 gwei">
            <span>gwei</span>
            <input type="number" min="30" max="5000" step="50" aria-label="Priority fee v gwei" value={draft.priority_gwei} onChange={edit("priority_gwei")} style={{ paddingLeft: 48 }} />
          </label>
          <button type="button" className={styles.primaryButton} disabled={saving} onClick={() => void save(true)}>
            {saving ? "Ukladám…" : config?.enabled && !dirty ? "Uložiť zmeny" : "Zapnúť nákup"}
          </button>
          {config?.enabled ? (
            <button type="button" className={styles.refreshButton} disabled={saving} onClick={() => void save(false)}>
              Vypnúť
            </button>
          ) : null}
        </div>
      ) : null}
      <p className={config?.enabled ? styles.goodText : styles.mutedText}>
        {config?.enabled ? "Bot drop kúpi pri štarte." : "Bot je pre drop vypnutý."}
        {drop?.updated ? ` Stav načítaný ${new Date(drop.updated * 1000).toLocaleTimeString("sk-SK")}.` : ""}
      </p>

      <h3>Whitelist (MetaMask)</h3>
      {!drop?.contract ? (
        <p className={styles.mutedText}>Whitelist sa ukáže, keď DOLZ zverejní kontrakt a zoznam.</p>
      ) : !drop.whitelist?.size ? (
        <p className={styles.mutedText}>DOLZ zatiaľ whitelist pre túto kartu nezverejnil.</p>
      ) : drop.whitelist.root_ok === false ? (
        <p className={styles.badText}>Zoznam od DOLZ nesedí s kontraktom ({drop.whitelist.size} adries), nákup z whitelistu by neprešiel.</p>
      ) : !listed.length ? (
        <p className={styles.mutedText}>Na whiteliste ({drop.whitelist.size} adries) nie je žiadny z tvojich walletov.</p>
      ) : (
        <ul className={styles.ruleList}>
          {listed.map(([wallet, allocation]) => (
            <li key={wallet}>
              {short(wallet)}: {allocation} ks za {priceText}
              {drop.proofs?.[wallet] ? (
                <>
                  {" "}
                  <button type="button" className={styles.refreshButton} disabled={!!busy} onClick={() => void metamask(wallet, "approve")}>
                    {busy === `${wallet}:approve` ? "Schvaľujem…" : `1. Schváliť ${drop.symbol ?? ""}`}
                  </button>{" "}
                  <button type="button" className={styles.primaryButton} disabled={!!busy} onClick={() => void metamask(wallet, "buy")}>
                    {busy === `${wallet}:buy` ? "Kupujem…" : "2. Kúpiť z whitelistu"}
                  </button>
                </>
              ) : (
                " (hot wallet, kúpi bot)"
              )}
            </li>
          ))}
        </ul>
      )}
      {message ? <p className={message.ok ? styles.goodText : styles.badText}>{message.text}</p> : null}
    </section>
  );
}
