"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./dolz.module.css";
import { errorText, estimateGas, POLYGON, polygonFees, provider, short, waitForReceipt, word } from "./metamask";
import type { DolzShieldApproval, DolzShieldStatus } from "@/app/lib/dolzSniper";

const SET_APPROVAL_FOR_ALL = "0xa22cb465"; // setApprovalForAll(address,bool)
const APPROVE = "0x095ea7b3"; // approve(address,uint256), ERC-20 and ERC-721

/** The call that withdraws an approval; the user signs it in MetaMask. */
function revokeCall(approval: DolzShieldApproval): { to: string; data: string; value: string } {
  if (approval.kind === "all") return { to: approval.contract, data: `${SET_APPROVAL_FOR_ALL}${word(approval.operator)}${word("0")}`, value: "0x0" };
  if (approval.kind === "erc20") return { to: approval.contract, data: `${APPROVE}${word(approval.operator)}${word("0")}`, value: "0x0" };
  return { to: approval.contract, data: `${APPROVE}${word("0")}${word(BigInt(approval.token_id ?? "0").toString(16))}`, value: "0x0" };
}

function describe(approval: DolzShieldApproval): string {
  if (approval.kind === "all") return `všetky ${approval.token}`;
  if (approval.kind === "token") return `${approval.token} #${approval.token_id}`;
  return `${approval.token}${approval.amount ? ` (${approval.amount})` : ""}`;
}

/**
 * Shield for the MetaMask wallet: the sniper watches it and alerts on Discord; here are its live approvals,
 * each revocable with one MetaMask signature, and the latest alerts.
 */
export default function ShieldPanel({ token }: { token: string }) {
  const [shield, setShield] = useState<DolzShieldStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&view=shield`, { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; shield?: DolzShieldStatus; error?: string };
      if (!response.ok || !json.ok || !json.shield) throw new Error(json.error || `HTTP ${response.status}`);
      setShield(json.shield);
    } catch (loadError) {
      setNotice({ ok: false, text: loadError instanceof Error ? loadError.message : "Štít sa nepodarilo načítať." });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const revoke = async (wallet: string, approval: DolzShieldApproval, key: string) => {
    const eth = provider();
    if (!eth) {
      setNotice({ ok: false, text: "MetaMask sa v tomto prehliadači nenašiel." });
      return;
    }
    setBusy(key);
    setNotice(null);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts[0]?.toLowerCase();
      if (from !== wallet) throw new Error(`V MetaMasku je vybraný účet ${from ? short(from) : "—"}. Prepni na ${short(wallet)}.`);
      const chain = (await eth.request({ method: "eth_chainId" })) as string;
      if (chain.toLowerCase() !== POLYGON) await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: POLYGON }] });
      const tx = { from, ...revokeCall(approval) };
      const gas = await estimateGas(eth, tx);
      const fees = await polygonFees(eth);
      setNotice({ ok: true, text: "Podpíš zrušenie v MetaMasku…" });
      const hash = (await eth.request({ method: "eth_sendTransaction", params: [{ ...tx, gas, ...fees }] })) as string;
      if (!(await waitForReceipt(eth, hash))) throw new Error("Zrušenie neprešlo.");
      setNotice({ ok: true, text: `Povolenie pre ${approval.label ?? short(approval.operator)} je zrušené.` });
      setShield((current) =>
        current ? { ...current, approvals: { ...current.approvals, [wallet]: (current.approvals[wallet] ?? []).filter((item) => item !== approval) } } : current,
      );
    } catch (revokeError) {
      setNotice({ ok: false, text: errorText(revokeError) });
    } finally {
      setBusy(null);
    }
  };

  const wallets = shield?.wallets ?? [];
  const unknown = wallets.reduce((count, wallet) => count + (shield?.approvals[wallet] ?? []).filter((item) => !item.known).length, 0);

  return (
    <section className={styles.panelFull}>
      <div className={styles.panelTitleRow}>
        <h2>Štít MetaMasku</h2>
        <span className={unknown ? styles.badText : styles.goodText}>
          {loading && !shield ? "Načítavam…" : unknown ? `${unknown} povolení pre neznáme adresy` : "žiadne povolenia pre neznáme adresy"}
        </span>
      </div>
      <p className={styles.chartNote}>
        Sniper sleduje MetaMask každých pár sekúnd. Keď niekto získa povolenie presúvať tvoje karty alebo míňať USDC/DOLZ, alebo keď z walletu odíde karta či
        token na neznámu adresu, príde správa na Discord. Zablokovať to nemôže (kľúč má len MetaMask), no povolenie tu zrušíš jedným podpisom. Známe sú
        DOLZ market, aukcie, minting a tvoje wallety.
      </p>
      <div className={styles.sellBulk}>
        <button type="button" className={styles.refreshButton} onClick={() => void load()} disabled={loading || !!busy}>
          {loading ? "Načítavam…" : "Obnoviť"}
        </button>
      </div>
      {notice ? <p className={notice.ok ? styles.goodText : styles.badText}>{notice.text}</p> : null}

      {wallets.map((wallet) => (
        <div key={wallet} className={styles.tableWrap}>
          <table className={styles.sellTable}>
            <thead>
              <tr>
                <th>Povolenie ({short(wallet)})</th>
                <th>Pre koho</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!(shield?.approvals[wallet] ?? []).length ? (
                <tr>
                  <td colSpan={3} className={styles.emptyCell}>
                    Žiadne aktívne povolenia.
                  </td>
                </tr>
              ) : (
                (shield?.approvals[wallet] ?? []).map((approval) => {
                  const key = `${wallet}:${approval.kind}:${approval.contract}:${approval.operator}:${approval.token_id ?? ""}`;
                  return (
                    <tr key={key}>
                      <td>{describe(approval)}</td>
                      <td>
                        <span className={approval.known ? styles.goodText : styles.badText}>{approval.label ?? "NEZNÁMA adresa"}</span>{" "}
                        <a href={`https://polygonscan.com/address/${approval.operator}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                          {short(approval.operator)}
                        </a>
                      </td>
                      <td>
                        <button type="button" className={styles.refreshButton} disabled={!!busy} onClick={() => void revoke(wallet, approval, key)}>
                          {busy === key ? "Čakám…" : "Zrušiť"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ))}

      <h3 className={styles.subheading}>Posledné upozornenia</h3>
      {shield?.alerts.length ? (
        <ul>
          {shield.alerts.map((alert) => (
            <li key={`${alert.tx}:${alert.at}:${alert.kind}`} className={styles.badText}>
              {new Date(alert.at * 1000).toLocaleString("sk-SK")} · {alert.message}{" "}
              <a href={`https://polygonscan.com/tx/${alert.tx}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                transakcia
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.chartNote}>Od spustenia snipera žiadne.</p>
      )}
    </section>
  );
}
