"use client";

import { useEffect, useState } from "react";
import styles from "./dolz.module.css";

const OWN_BUILD = process.env.APP_BUILD_ID ?? null;

/** A bar asking to reload once a newer deploy is live (the Obnoviť buttons only reload data, not the page code). */
export default function NewVersionBar() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!OWN_BUILD) return;
    const check = async () => {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const json = (await response.json()) as { build?: string | null };
        if (json.build && json.build !== OWN_BUILD) setStale(true);
      } catch {
        // offline or mid-deploy: try again later
      }
    };
    const id = window.setInterval(() => void check(), 120_000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className={styles.sellBulk} role="status" style={{ justifyContent: "space-between", marginBottom: 12 }}>
      <span className={styles.goodText}>Je dostupná nová verzia stránky.</span>
      <button type="button" className={styles.primaryButton} onClick={() => window.location.reload()}>
        Obnoviť stránku
      </button>
    </div>
  );
}
