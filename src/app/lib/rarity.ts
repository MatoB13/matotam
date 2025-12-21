// Backward-compatible rarity info:
// - getRarityInfo(senderAddr, recipientAddr)  => pair-based deterministic code
// - getRarityInfo(mintDate?)                  => date-based code (epoch-based, per your agreement)

type RarityInfo = {
  code: string;        // legacy field used across the app
  rarityCode: string;  // explicit field name
  projectYear?: number;
  dayInYear?: number;
  pairHash?: number;
};

// Matotam epoch (the day the "time code" starts progressing).
// Everything BEFORE this date is pinned to Y00D000.
// Starting FROM this date, we increment day counter daily.
const MATOTAM_EPOCH_UTC = new Date(Date.UTC(2026, 0, 1, 0, 0, 0)); // 2026-01-01T00:00:00Z

function hashToUint32(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function formatCode(yy: number, ddd: number): string {
  const code = `Y${yy.toString().padStart(2, "0")}D${ddd.toString().padStart(3, "0")}`;
  return code;
}

function formatRarityFromPair(senderAddr: string, recipientAddr: string): RarityInfo {
  // Pair-based code is deterministic and does NOT depend on date.
  const seed = `${senderAddr}|${recipientAddr}`;
  const h = hashToUint32(seed);

  // Map hash -> YxxDxxx
  const yy = h % 100; // 00..99
  const ddd = Math.floor(h / 100) % 1000; // 000..999

  const code = formatCode(yy, ddd);

  return {
    code,
    rarityCode: code,
    pairHash: h,
  };
}

function normalizeToUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

function formatRarityFromDate(mintDate: Date): RarityInfo {
  const mint = normalizeToUtcMidnight(mintDate);
  const epoch = MATOTAM_EPOCH_UTC;

  // Agreement: everything before epoch is pinned to Y00D000
  if (mint.getTime() < epoch.getTime()) {
    const code = "Y00D000";
    return { projectYear: 0, dayInYear: 0, code, rarityCode: code };
  }

  // Agreement: day index starts at 1 on 2026-01-01
  // diffDays = 0 on epoch day; we want D001 on epoch day => use +1
  const diffMs = mint.getTime() - epoch.getTime();
  const diffDays = Math.floor(diffMs / (24 * 3600 * 1000)) + 1;

  // Agreement: year = floor(diffDays / 365), day = diffDays % 365
  // This intentionally ignores leap years to keep deterministic, simple progression.
  const projectYear = Math.floor(diffDays / 365);
  const dayInYear = diffDays % 365;

  const yy = Math.max(0, projectYear) % 100;
  const ddd = Math.max(0, dayInYear) % 1000;

  const code = formatCode(yy, ddd);

  return { projectYear, dayInYear, code, rarityCode: code };
}

// Overloads
export function getRarityInfo(mintDate?: Date): RarityInfo;
export function getRarityInfo(senderAddr: string, recipientAddr: string): RarityInfo;

// Implementation
export function getRarityInfo(a: any = new Date(), b?: any): RarityInfo {
  // Pair-based mode (legacy)
  if (typeof a === "string" && typeof b === "string") {
    return formatRarityFromPair(a, b);
  }

  // Date-based mode (epoch-based per agreement)
  const mintDate: Date = a instanceof Date ? a : new Date();
  return formatRarityFromDate(mintDate);
}
