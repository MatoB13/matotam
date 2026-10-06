"use client";

import { useCallback, useEffect, useState } from "react";
import { actionHeaders } from "./actionPassword";
import styles from "./dolz.module.css";
import type { DolzSellCard, DolzSellInventory, DolzSellOffer, DolzSellResult } from "@/app/lib/dolzSniper";

const DEFAULT_DURATIONS = [1, 2, 3, 7, 30, 90, 180];
const DEFAULT_DAYS = 30;

type RowDraft = { price: string; days: number };
type RowNote = { ok: boolean; text: string; tx?: string };

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

function durationLabel(days: number): string {
  if (days === 1) return "1 deň";
  if (days < 5) return `${days} dni`;
  return `${days} dní`;
}

function listingState(card: DolzSellCard, now: number): "active" | "expired" | "none" {
  if (!card.listing) return "none";
  if (card.listing.active && (!card.listing.expiration || card.listing.expiration * 1000 > now)) return "active";
  return "expired";
}

function cardTitle(card: DolzSellCard): string {
  return card.name?.trim() || `#${card.token_id}`;
}

export default function SellPanel({ token }: { token: string }) {
  const [inventory, setInventory] = useState<DolzSellInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<RowDraft>({ price: "", days: DEFAULT_DAYS });
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, RowNote>>({});
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/dolz/sell?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; inventory?: DolzSellInventory; error?: string };
      if (!response.ok || !json.ok || !json.inventory) throw new Error(json.error || `HTTP ${response.status}`);
      setInventory(json.inventory);
      setLoadedAt(Date.now());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nepodarilo sa načítať karty.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(first);
  }, [load]);

  const durations = inventory?.durations?.length ? inventory.durations : DEFAULT_DURATIONS;
  const cards = inventory?.cards ?? [];
  const draftFor = (card: DolzSellCard): RowDraft =>
    drafts[card.token_id] ?? {
      price: card.listing?.price_usd ? card.listing.price_usd.toFixed(2) : "",
      days: DEFAULT_DAYS,
    };
  const setDraft = (tokenId: string, patch: Partial<RowDraft>, card: DolzSellCard) =>
    setDrafts((current) => ({ ...current, [tokenId]: { ...(current[tokenId] ?? draftFor(card)), ...patch } }));
  const toggle = (tokenId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(tokenId)) next.delete(tokenId);
      else next.add(tokenId);
      return next;
    });
  const allSelected = cards.length > 0 && cards.every((card) => selected.has(card.token_id));

  const submit = async (label: string, action: "list" | "cancel" | "transfer" | "accept_offer" | "reject_offer", payload: object) => {
    setBusy(label);
    setError(null);
    try {
      const response = await fetch(`/api/dolz/sell?token=${encodeURIComponent(token)}${action === "list" ? "" : `&action=${action}`}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...actionHeaders() },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as { ok: boolean; results?: DolzSellResult[]; error?: string };
      if (!response.ok || !json.ok || !json.results) throw new Error(json.error || `HTTP ${response.status}`);
      setNotes((current) => {
        const next = { ...current };
        for (const result of json.results ?? []) {
          next[result.token_id] = result.ok
            ? { ok: true, text: action === "cancel" ? "ponuka zrušená" : (result.action ?? "vystavené"), tx: result.tx }
            : { ok: false, text: result.error ?? "zlyhalo", tx: result.tx };
        }
        return next;
      });
      setDrafts({});
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Predaj zlyhal.");
    } finally {
      setBusy(null);
    }
  };

  const listOne = (card: DolzSellCard) => {
    const draft = draftFor(card);
    const price = Number(draft.price);
    if (!(price > 0)) {
      setError(`Zadaj cenu pre ${cardTitle(card)}.`);
      return;
    }
    void submit(card.token_id, "list", { items: [{ token_id: card.token_id, price_usd: price, days: draft.days }] });
  };

  const listSelected = () => {
    const price = Number(bulk.price);
    if (!(price > 0)) {
      setError("Zadaj cenu pre vybrané karty.");
      return;
    }
    const items = cards.filter((card) => selected.has(card.token_id)).map((card) => ({ token_id: card.token_id, price_usd: price, days: bulk.days }));
    if (items.length) void submit("bulk", "list", { items });
  };

  const feeBps = inventory?.sellerFeeBps ?? null;
  const afterFees = (usd: number | null) => (usd !== null && feeBps !== null ? usd * (1 - feeBps / 10_000) : null);

  const acceptOffer = (card: DolzSellCard, offer: DolzSellOffer) => {
    const net = afterFees(offer.price_usd);
    const question =
      `Predať ${cardTitle(card)} za ${formatUsd(offer.price_usd)}` +
      (net !== null ? ` (po poplatkoch dostaneš ~${formatUsd(net)})` : "") +
      `?\nKupujúci: ${offer.offerer}` +
      (listingState(card, loadedAt) === "active" ? "\nTvoja ponuka na markete sa tým zruší." : "");
    if (!window.confirm(question)) return;
    void submit(card.token_id, "accept_offer", { token_id: card.token_id, offerer: offer.offerer, price_raw: offer.price_raw });
  };

  const rejectOffer = (card: DolzSellCard, offer: DolzSellOffer) => {
    if (!window.confirm(`Odmietnuť ponuku ${formatUsd(offer.price_usd)} na ${cardTitle(card)}? Stojí to trochu POL; ponuka inak sama vyprší.`)) return;
    void submit(card.token_id, "reject_offer", { token_id: card.token_id, offerer: offer.offerer });
  };

  const offerCount = cards.reduce((sum, card) => sum + (card.offers?.length ?? 0), 0);

  const transferTarget = inventory?.transferTargets?.[0] ?? null;
  const transferSelected = () => {
    const tokenIds = cards.filter((card) => selected.has(card.token_id)).map((card) => card.token_id);
    if (!transferTarget || !tokenIds.length) return;
    const listed = cards.filter((card) => selected.has(card.token_id) && listingState(card, loadedAt) === "active").length;
    const question =
      `Presunúť ${tokenIds.length} ${tokenIds.length === 1 ? "kartu" : tokenIds.length < 5 ? "karty" : "kariet"} na ${transferTarget}?` +
      (listed ? `\n${listed} z nich ${listed === 1 ? "je vystavená" : "sú vystavené"} na predaj, ponuky sa najprv zrušia.` : "");
    if (!window.confirm(question)) return;
    setSelected(new Set());
    void submit("bulk", "transfer", { token_ids: tokenIds, to: transferTarget });
  };

  const cancelSelected = () => {
    const tokenIds = cards.filter((card) => selected.has(card.token_id) && listingState(card, loadedAt) === "active").map((card) => card.token_id);
    if (tokenIds.length) void submit("bulk", "cancel", { token_ids: tokenIds });
  };

  const selectedListed = cards.filter((card) => selected.has(card.token_id) && listingState(card, loadedAt) === "active").length;
  const listedCount = cards.filter((card) => listingState(card, loadedAt) === "active").length;

  return (
    <section className={styles.panelFull}>
      <div className={styles.panelTitleRow}>
        <h2>Karty na hot wallete</h2>
        <span>
          {inventory ? `${cards.length} kariet · ${listedCount} na predaj` : ""}
          {offerCount ? <strong className={styles.goodText}>{` · ${offerCount} ${offerCount === 1 ? "ponuka" : offerCount < 5 ? "ponuky" : "ponúk"} od kupcov`}</strong> : null}
          {loadedAt ? ` · ${new Date(loadedAt).toLocaleTimeString("sk-SK")}` : ""}
        </span>
      </div>
      <p className={styles.chartNote}>
        Karty sa vystavujú na DOLZ markete v USDC priamo z hot walletu snipera. Každá karta je jedna transakcia (gas v POL). Pri prvom predaji sa raz
        schváli market (setApprovalForAll). Zmena ceny prepíše aj trvanie ponuky. Trh = medián predajov rovnakej karty a tieru za USDC.
      </p>
      {error ? <p className={styles.badText}>{error}</p> : null}

      <div className={styles.sellBulk}>
        <span className={styles.mutedText}>Vybrané: {selected.size}</span>
        <label className={styles.moneyInput}>
          <span>$</span>
          <input
            id="sell-bulk-price"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="cena"
            aria-label="Cena pre vybrané karty v USD"
            value={bulk.price}
            onChange={(event) => setBulk((current) => ({ ...current, price: event.target.value }))}
          />
        </label>
        <select
          id="sell-bulk-days"
          aria-label="Trvanie ponuky pre vybrané karty"
          value={bulk.days}
          onChange={(event) => setBulk((current) => ({ ...current, days: Number(event.target.value) }))}
        >
          {durations.map((days) => (
            <option key={days} value={days}>
              {durationLabel(days)}
            </option>
          ))}
        </select>
        <button type="button" className={styles.primaryButton} onClick={listSelected} disabled={!!busy || selected.size === 0}>
          {busy === "bulk" ? "Odosielam…" : "Vystaviť vybrané"}
        </button>
        <button type="button" className={styles.refreshButton} onClick={cancelSelected} disabled={!!busy || selectedListed === 0}>
          Zrušiť ponuky vybraných
        </button>
        {transferTarget ? (
          <button
            type="button"
            className={styles.refreshButton}
            onClick={transferSelected}
            disabled={!!busy || selected.size === 0}
            title={`Pošle vybrané karty na ${transferTarget}`}
          >
            Presunúť na {transferTarget.slice(0, 6)}…{transferTarget.slice(-4)}
          </button>
        ) : null}
        <button type="button" className={styles.refreshButton} onClick={() => void load()} disabled={loading || !!busy}>
          {loading ? "Načítavam…" : "Obnoviť"}
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.sellTable}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Vybrať všetky karty"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(cards.map((card) => card.token_id)))}
                />
              </th>
              <th>Karta</th>
              <th>Rarita</th>
              <th className={styles.num}>Kúpené</th>
              <th className={styles.num}>Trh</th>
              <th>Vystavené</th>
              <th>Ponuky kupcov</th>
              <th>Cena</th>
              <th>Trvanie</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!cards.length ? (
              <tr>
                <td colSpan={10} className={styles.emptyCell}>
                  {loading ? "Načítavam karty z hot walletu…" : "Na hot wallete nie sú žiadne karty."}
                </td>
              </tr>
            ) : (
              cards.map((card) => {
                const draft = draftFor(card);
                const state = listingState(card, loadedAt);
                const note = notes[card.token_id];
                const rowBusy = busy === card.token_id;
                return (
                  <tr key={card.token_id} className={selected.has(card.token_id) ? styles.sellSelected : undefined}>
                    <td>
                      <input type="checkbox" aria-label={`Vybrať ${cardTitle(card)}`} checked={selected.has(card.token_id)} onChange={() => toggle(card.token_id)} />
                    </td>
                    <td>
                      <span className={styles.sellCard}>
                        {card.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- remote card art, no need for the image optimizer
                          <img src={card.image} alt="" loading="lazy" width={36} height={50} />
                        ) : null}
                        <span>
                          {cardTitle(card)}
                          <small className={styles.mutedText}>
                            {card.card ?? "?"} · #{card.token_id}
                          </small>
                        </span>
                      </span>
                    </td>
                    <td>
                      {[card.rarity, card.tier ? `/${card.tier}` : null].filter(Boolean).join(" ") || "—"}
                      {card.serial != null ? <small className={styles.mutedText}> · #{card.serial}</small> : null}
                    </td>
                    <td className={styles.num}>{formatUsd(card.bought_usd)}</td>
                    <td className={styles.num} title={card.market ? `${card.market.sales} predajov (${card.market.source})` : "Žiadne predaje za USDC"}>
                      {formatUsd(card.market?.usd)}
                      {card.market ? <small className={styles.mutedText}> · {card.market.sales}×</small> : null}
                    </td>
                    <td>
                      {state === "active" && card.listing ? (
                        <span className={styles.goodText}>
                          {formatUsd(card.listing.price_usd)}
                          {card.listing.expiration ? (
                            <small className={styles.mutedText}> do {new Date(card.listing.expiration * 1000).toLocaleDateString("sk-SK")}</small>
                          ) : null}
                        </span>
                      ) : state === "expired" ? (
                        <span className={styles.mutedText}>vypršala</span>
                      ) : (
                        <span className={styles.mutedText}>—</span>
                      )}
                      {note ? (
                        <small className={note.ok ? styles.goodText : styles.badText} title={note.text}>
                          {" "}
                          {note.tx ? (
                            <a href={`https://polygonscan.com/tx/${note.tx}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                              {note.ok ? `✓ ${note.text}` : "✕ tx"}
                            </a>
                          ) : (
                            `✕ ${note.text.slice(0, 60)}`
                          )}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      {card.offers?.length ? (
                        <span className={styles.offerList}>
                          {card.offers.map((offer) => (
                            <span key={offer.offerer} className={styles.offerRow}>
                              <span title={`Od ${offer.offerer}`}>
                                <strong className={offer.fundable === false ? styles.mutedText : styles.goodText}>
                                  {offer.price_usd !== null ? formatUsd(offer.price_usd) : `${offer.price_raw} ${offer.currency}`}
                                </strong>
                                <small className={styles.mutedText}>
                                  {afterFees(offer.price_usd) !== null ? ` · dostaneš ${formatUsd(afterFees(offer.price_usd))}` : ""}
                                  {offer.expiration ? ` · do ${new Date(offer.expiration * 1000).toLocaleDateString("sk-SK")}` : ""}
                                  {offer.fundable === false ? " · kupec nemá krytie" : ""}
                                </small>
                              </span>
                              <span className={styles.sellActions}>
                                <button
                                  type="button"
                                  className={styles.primaryButton}
                                  onClick={() => acceptOffer(card, offer)}
                                  disabled={!!busy || offer.fundable === false || offer.price_usd === null}
                                >
                                  {rowBusy ? "…" : "Prijať"}
                                </button>
                                <button
                                  type="button"
                                  className={styles.iconButton}
                                  onClick={() => rejectOffer(card, offer)}
                                  disabled={!!busy}
                                  aria-label={`Odmietnuť ponuku ${formatUsd(offer.price_usd)}`}
                                  title="Odmietnuť (stojí gas, inak ponuka sama vyprší)"
                                >
                                  ✕
                                </button>
                              </span>
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className={styles.mutedText}>—</span>
                      )}
                    </td>
                    <td>
                      <label className={`${styles.moneyInput} ${styles.sellPrice}`}>
                        <span>$</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          inputMode="decimal"
                          placeholder={card.market ? card.market.usd.toFixed(2) : "cena"}
                          aria-label={`Cena pre ${cardTitle(card)} v USD`}
                          value={draft.price}
                          onChange={(event) => setDraft(card.token_id, { price: event.target.value }, card)}
                        />
                      </label>
                    </td>
                    <td>
                      <select
                        aria-label={`Trvanie ponuky pre ${cardTitle(card)}`}
                        value={draft.days}
                        onChange={(event) => setDraft(card.token_id, { days: Number(event.target.value) }, card)}
                      >
                        {durations.map((days) => (
                          <option key={days} value={days}>
                            {durationLabel(days)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={styles.sellActions}>
                        <button type="button" className={styles.primaryButton} onClick={() => listOne(card)} disabled={!!busy}>
                          {rowBusy ? "…" : state === "active" ? "Zmeniť" : "Vystaviť"}
                        </button>
                        {state === "active" ? (
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => void submit(card.token_id, "cancel", { token_ids: [card.token_id] })}
                            disabled={!!busy}
                            aria-label={`Zrušiť ponuku ${cardTitle(card)}`}
                            title="Zrušiť ponuku"
                          >
                            ✕
                          </button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {busy ? <p className={styles.chartNote}>Posielam transakcie a čakám na potvrdenie (pár sekúnd na kartu)…</p> : null}
    </section>
  );
}
