"use client";

import { useEffect, useState } from "react";
import { actionHeaders } from "./actionPassword";
import styles from "./dolz.module.css";
import type { DolzSellResult, DolzSniperQuote } from "@/app/lib/dolzSniper";

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

/** Paste a dolz.io card link (or token id), see its listing, buy it from the hot wallet. */
export default function QuickBuy({ token, onBought }: { token: string; onBought: () => void }) {
  const [link, setLink] = useState("");
  const [quote, setQuote] = useState<DolzSniperQuote | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "buying">("idle");
  const [message, setMessage] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);

  const post = async <T,>(action: "quote" | "buy", body: object): Promise<T> => {
    const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&action=${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...actionHeaders() },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as T & { ok: boolean; error?: string };
    if (!response.ok || !json.ok) throw new Error(json.error || `HTTP ${response.status}`);
    return json;
  };

  // Load the card as soon as a link is pasted or typed.
  useEffect(() => {
    const value = link.trim();
    if (!value) return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      setState("loading");
      setMessage(null);
      try {
        const json = await post<{ quote: DolzSniperQuote }>("quote", { link: value });
        if (!cancelled) setQuote(json.quote);
      } catch (error) {
        if (!cancelled) {
          setQuote(null);
          setMessage({ ok: false, text: error instanceof Error ? error.message : "Kartu sa nepodarilo načítať." });
        }
      } finally {
        if (!cancelled) setState("idle");
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- post only depends on token
  }, [link, token]);

  const listing = quote?.listing;
  const canBuy =
    !!quote && !!listing && listing.active && listing.price_usd !== null && listing.price_usd <= quote.maxPriceUsd && state === "idle";

  const buy = async () => {
    if (!quote || !listing || listing.price_usd === null) return;
    const name = quote.card.name?.trim() || `#${quote.token_id}`;
    if (!window.confirm(`Kúpiť ${name} za ${formatUsd(listing.price_usd)} z hot walletu?`)) return;
    setState("buying");
    setMessage(null);
    try {
      const json = await post<{ results: DolzSellResult[] }>("buy", { link: quote.token_id, price_raw: listing.price_raw });
      const result = json.results[0];
      setMessage(result?.ok ? { ok: true, text: `Kúpené za ${formatUsd(listing.price_usd)}`, tx: result.tx } : { ok: false, text: result?.error ?? "Nákup neprešiel.", tx: result?.tx });
      if (result?.ok) {
        setQuote(null);
        setLink("");
      }
      onBought();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Nákup zlyhal." });
    } finally {
      setState("idle");
    }
  };

  const card = quote?.card;
  return (
    <section className={styles.panelFull}>
      <div className={styles.panelTitleRow}>
        <h2>Rýchly nákup</h2>
        <span>z hot walletu, mimo denného limitu snipera</span>
      </div>
      <div className={styles.sellBulk}>
        <input
          id="quick-buy-link"
          className={styles.quickBuyInput}
          placeholder="Vlož odkaz na kartu z dolz.io (alebo číslo tokenu)"
          aria-label="Odkaz na kartu"
          value={link}
          onChange={(event) => {
            setLink(event.target.value);
            if (!event.target.value.trim()) {
              setQuote(null);
              setMessage(null);
            }
          }}
        />
        <button type="button" className={styles.primaryButton} onClick={() => void buy()} disabled={!canBuy}>
          {state === "buying" ? "Kupujem…" : listing?.price_usd != null && listing.active ? `Kúpiť za ${formatUsd(listing.price_usd)}` : "Kúpiť"}
        </button>
      </div>
      {state === "loading" ? <p className={styles.chartNote}>Načítavam kartu…</p> : null}
      {quote && card ? (
        <div className={styles.sellCard}>
          {card.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote card art, no need for the image optimizer
            <img src={card.image} alt="" width={36} height={50} />
          ) : null}
          <span>
            {card.name?.trim() || `#${quote.token_id}`}
            <small className={styles.mutedText}>
              {[card.card, card.season ? `S${card.season}` : null, card.rarity, card.tier ? `/${card.tier}` : null, card.serial != null ? `#${card.serial}` : null]
                .filter(Boolean)
                .join(" · ")}
            </small>
            <small className={listing?.active ? styles.goodText : styles.badText}>
              {!listing
                ? "Karta nie je na predaj."
                : !listing.active
                  ? "Ponuka už neplatí."
                  : listing.price_usd === null
                    ? `Predáva sa v inej mene (${listing.currency}).`
                    : listing.price_usd > quote.maxPriceUsd
                      ? `Cena ${formatUsd(listing.price_usd)} je nad bezpečnostným limitom ${formatUsd(quote.maxPriceUsd)}.`
                      : `Na predaj za ${formatUsd(listing.price_usd)}${listing.expiration ? ` do ${new Date(listing.expiration * 1000).toLocaleDateString("sk-SK")}` : ""}`}
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
    </section>
  );
}
