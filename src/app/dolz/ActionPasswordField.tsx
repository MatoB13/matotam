"use client";

import { useEffect, useState } from "react";
import styles from "./dolz.module.css";
import { getActionPassword, setActionPassword } from "./actionPassword";

/** Password for buys, offers, listings, transfers and sniper settings; kept only in this browser tab. */
export default function ActionPasswordField() {
  const [saved, setSaved] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setSaved(!!getActionPassword()), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (saved) {
    return (
      <span className={styles.passwordState}>
        🔓 Transakcie odomknuté
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => {
            setActionPassword(null);
            setSaved(false);
          }}
        >
          zamknúť
        </button>
      </span>
    );
  }
  return (
    <form
      className={styles.passwordForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (!value) return;
        setActionPassword(value.trim());
        setValue("");
        setSaved(true);
      }}
    >
      <input
        type="password"
        autoComplete="current-password"
        placeholder="🔒 Heslo pre transakcie"
        aria-label="Heslo pre transakcie"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className={styles.refreshButton} disabled={!value}>
        Odomknúť
      </button>
    </form>
  );
}
