// Backward-compatible rarity info:
// - getRarityInfo(senderAddr, recipientAddr)  => pair-based deterministic code
// - getRarityInfo(mintDate?)                  => date-based code (your newer logic)

type RarityInfo = {
  code: string;        // legacy field used across the app
  rarityCode: string;  // explicit field name
  projectYear?: number;
  dayInYear?: number;
  pairHash?: number;
};

function getProjectStartDate(): Date {
  // "Genesis" date for date-based rarity.
  // IMPORTANT: if you previously used a different start date,
  // set it here to keep codes stable.
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0)); // 2026-01-01 UTC
}


function hashToUint32(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function formatRarityFromPair(senderAddr: string, recipientAddr: string): RarityInfo {
  const seed = `${senderAddr}|${recipientAddr}`;
  const h = hashToUint32(seed);

  // Map to YxxDxxx
  const yy = h % 100;                 // 00..99
  const ddd = Math.floor(h / 100) % 1000; // 000..999

  const code = `Y${yy.toString().padStart(2, "0")}D${ddd.toString().padStart(3, "0")}`;

  return {
    code,
    rarityCode: code,
    pairHash: h,
  };
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

  // Date-based mode (your current implementation)
  const mintDate: Date = a instanceof Date ? a : new Date();
  const projectStart = getProjectStartDate();

  // Normalize both dates to UTC midnight
  const mint = new Date(
    Date.UTC(
      mintDate.getUTCFullYear(),
      mintDate.getUTCMonth(),
      mintDate.getUTCDate(),
      0,
      0,
      0
    )
  );

  const start = new Date(
    Date.UTC(
      projectStart.getUTCFullYear(),
      projectStart.getUTCMonth(),
      projectStart.getUTCDate(),
      0,
      0,
      0
    )
  );

  // Everything before project start -> Y00D000
  if (mint < start) {
    const code = "Y00D000";
    return { projectYear: 0, dayInYear: 0, code, rarityCode: code };
  }

  // Candidate year difference
  const candidateYear = mint.getUTCFullYear() - start.getUTCFullYear();

  // Anniversary of the candidate project year
  const anniversary = new Date(
    Date.UTC(
      start.getUTCFullYear() + candidateYear,
      start.getUTCMonth(),
      start.getUTCDate(),
      0,
      0,
      0
    )
  );

  const projectYear = mint < anniversary ? candidateYear - 1 : candidateYear;

  const yearStart = new Date(
    Date.UTC(
      start.getUTCFullYear() + projectYear,
      start.getUTCMonth(),
      start.getUTCDate(),
      0,
      0,
      0
    )
  );

  const dayInYear = Math.floor((mint.getTime() - yearStart.getTime()) / (24 * 3600 * 1000));

  const yy = Math.max(0, projectYear) % 100;
  const ddd = Math.max(0, dayInYear) % 1000;

  const code = `Y${yy.toString().padStart(2, "0")}D${ddd.toString().padStart(3, "0")}`;

  return { projectYear, dayInYear, code, rarityCode: code };
}
