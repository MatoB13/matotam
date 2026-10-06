"use client";

import { useCallback, useEffect, useState } from "react";
import { actionHeaders } from "./actionPassword";
import styles from "./dolz.module.css";
import type { DolzMyOffer, DolzSellResult, DolzSniperQuote } from "@/app/lib/dolzSniper";

const DURATIONS = [1, 2, 3, 7, 30, 90, 180];
const DOLZ_NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc";

function formatUsd(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `$${value.toFixed(2)}`;
}

function durationLabel(days: number): string {
  return days === 1 ? "1 deň" : days < 5 ? `${days} dni` : `${days} dní`;
}

function cardText(card: DolzSniperQuote["card"] | undefined, tokenId: string): string {
  return card?.name?.trim() || `#${tokenId}`;
}

/** Offer USDC on any card from the hot wallet, and manage the open offers. */
export default function OfferPanel({ token }: { token: string }) {
  const [link, setLink] = useState("");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState(7);
  const [quote, setQuote] = useState<DolzSniperQuote | null>(null);
  const [offers, setOffers] = useState<DolzMyOffer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);

  const call = useCallback(
    async <T,>(query: string, body?: object): Promise<T> => {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&${query}`, {
        cache: "no-store",
        ...(body ? { method: "POST", headers: { "content-type": "application/json", ...actionHeaders() }, body: JSON.stringify(body) } : {}),
      });
      const json = (await response.json()) as T & { ok: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || `HTTP ${response.status}`);
      return json;
    },
    [token],
  );

  const loadOffers = useCallback(async () => {
    try {
      setOffers((await call<{ offers: DolzMyOffer[] }>("view=offers")).offers);
    } catch {
      setOffers((current) => current ?? []);
    }
  }, [call]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadOffers(), 0);
    return () => window.clearTimeout(id);
  }, [loadOffers]);

  // Show the card and its current listing as soon as a link is pasted.
  useEffect(() => {
    const value = link.trim();
    if (!value) return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const json = await call<{ quote: DolzSniperQuote }>("action=quote", { link: value });
        if (!cancelled) {
          setQuote(json.quote);
          setMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setQuote(null);
          setMessage({ ok: false, text: error instanceof Error ? error.message : "Kartu sa nepodarilo načítať." });
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [link, call]);

  const send = async (tokenId: string, amount: number, duration: number, label: string) => {
    if (!(amount > 0)) {
      setMessage({ ok: false, text: "Zadaj sumu ponuky." });
      return;
    }
    if (!window.confirm(`Poslať ponuku ${formatUsd(amount)} na ${label} na ${durationLabel(duration)}? USDC zostanú na hot wallete, kým predajca ponuku neprijme.`)) return;
    setBusy(tokenId);
    setMessage(null);
    try {
      const json = await call<{ results: DolzSellResult[] }>("action=offer", { token_id: tokenId, price_usd: amount, days: duration });
      const result = json.results[0];
      if (!result?.ok) throw new Error(result?.error || "Ponuka neprešla.");
      setMessage({ ok: true, text: `${result.action === "ponuka zmenená" ? "Ponuka zmenená" : "Ponuka odoslaná"}: ${formatUsd(amount)} na ${label}.`, tx: result.tx });
      setLink("");
      setPrice("");
      setQuote(null);
      void loadOffers();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Ponuka zlyhala." });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (offer: DolzMyOffer) => {
    if (!window.confirm(`Zrušiť ponuku ${formatUsd(offer.price_usd)} na ${cardText(offer.card, offer.token_id)}?`)) return;
    setBusy(offer.token_id);
    setMessage(null);
    try {
      const json = await call<{ results: DolzSellResult[] }>("action=offer_cancel", { token_id: offer.token_id });
      const result = json.results[0];
      if (!result?.ok) throw new Error(result?.error || "Zrušenie neprešlo.");
      setMessage({ ok: true, text: "Ponuka zrušená.", tx: result.tx });
      void loadOffers();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Zrušenie zlyhalo." });
    } finally {
      setBusy(null);
    }
  };

  const card = quote?.card;
  const listing = quote?.listing;
  return (
    <section className={styles.panelFull}>
      <div className={styles.panelTitleRow}>
        <h2>Ponuka (offer)</h2>
        <span>z hot walletu, predajca ju môže prijať</span>
      </div>
      <div className={styles.sellBulk}>
        <input
          className={styles.quickBuyInput}
          placeholder="Vlož odkaz na kartu z dolz.io (alebo číslo tokenu)"
          aria-label="Odkaz na kartu pre ponuku"
          value={link}
          onChange={(event) => {
            setLink(event.target.value);
            if (!event.target.value.trim()) setQuote(null);
          }}
        />
        <label className={styles.moneyInput}>
          <span>$</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="suma"
            aria-label="Suma ponuky v USD"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
        <select aria-label="Platnosť ponuky" value={days} onChange={(event) => setDays(Number(event.target.value))}>
          {DURATIONS.map((value) => (
            <option key={value} value={value}>
              {durationLabel(value)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!quote || !!busy}
          onClick={() => quote && void send(quote.token_id, Number(price), days, cardText(card, quote.token_id))}
        >
          {busy && quote && busy === quote.token_id ? "Odosielam…" : "Poslať ponuku"}
        </button>
      </div>
      {quote && card ? (
        <div className={styles.sellCard}>
          {card.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote card art, no need for the image optimizer
            <img src={card.image} alt="" width={36} height={50} />
          ) : null}
          <span>
            {cardText(card, quote.token_id)}
            <small className={styles.mutedText}>
              {[card.card, card.season ? `S${card.season}` : null, card.rarity, card.tier ? `/${card.tier}` : null, card.serial != null ? `#${card.serial}` : null]
                .filter(Boolean)
                .join(" · ")}
            </small>
            <small className={styles.mutedText}>
              {listing?.active && listing.price_usd != null ? `Teraz na predaj za ${formatUsd(listing.price_usd)}` : "Teraz nie je na predaj"}
            </small>
          </span>
        </div>
      ) : null}
      {message ? (
        <p className={message.ok ? styles.goodText : styles.badText}>
          {message.ok ? "✓ " : "✕ "}
          {message.text}
          {message.tx ? (
            <>
              {" · "}
              <a href={`https://polygonscan.com/tx/${message.tx}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                transakcia
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <h3 className={styles.subheading}>Moje otvorené ponuky{offers ? ` (${offers.length})` : ""}</h3>
      <div className={styles.tableWrap}>
        <table className={styles.sellTable}>
          <thead>
            <tr>
              <th>Karta</th>
              <th className={styles.num}>Ponuka</th>
              <th>Platí do</th>
              <th className={styles.num}>Cena na markete</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!offers ? (
              <tr>
                <td colSpan={5} className={styles.emptyCell}>
                  Načítavam…
                </td>
              </tr>
            ) : !offers.length ? (
              <tr>
                <td colSpan={5} className={styles.emptyCell}>
                  Žiadne otvorené ponuky.
                </td>
              </tr>
            ) : (
              offers.map((offer) => (
                <tr key={offer.token_id}>
                  <td>
                    <a href={`https://dolz.io/market/asset/${DOLZ_NFT}/${offer.token_id}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                      {cardText(offer.card, offer.token_id)}
                    </a>
                    <small className={styles.mutedText}>
                      {" "}
                      · {[offer.card?.card, offer.card?.rarity, offer.card?.serial != null ? `#${offer.card.serial}` : null].filter(Boolean).join(" · ")}
                    </small>
                  </td>
                  <td className={styles.num}>
                    {formatUsd(offer.price_usd)}
                    {offer.fundable === false ? <small className={styles.badText}> · nekrytá</small> : null}
                  </td>
                  <td>{offer.expiration ? new Date(offer.expiration * 1000).toLocaleDateString("sk-SK") : "—"}</td>
                  <td className={styles.num}>{offer.listing?.active ? formatUsd(offer.listing.price_usd) : "—"}</td>
                  <td>
                    <button type="button" className={styles.iconButton} disabled={!!busy} onClick={() => void cancel(offer)} aria-label="Zrušiť ponuku" title="Zrušiť ponuku">
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className={styles.chartNote}>
        Ak na kartu už ponuku máš, nová suma ju prepíše. Keď predajca ponuku prijme, karta príde na hot wallet a dostaneš správu na Discord. Prijatá ponuka sa
        nepočíta do denného limitu snipera.
      </p>
    </section>
  );
}
