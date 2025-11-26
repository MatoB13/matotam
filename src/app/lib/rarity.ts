// lib/rarity.ts
// Generates rarity code YxxDxxx with full leap-year accuracy,
// based on a fixed project start date.

export function getProjectStartDate(): Date {
  // Day 0 of the project (UTC)
  // You can adjust this later or move to an ENV variable.
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0)); 
  // Reminder: month index is 0-based → 10 = November
}

export function getRarityInfo(mintDate: Date = new Date()) {
  const projectStart = getProjectStartDate();

  // Normalize both dates to UTC midnight
  const mint = new Date(Date.UTC(
    mintDate.getUTCFullYear(),
    mintDate.getUTCMonth(),
    mintDate.getUTCDate(),
    0, 0, 0
  ));

  const start = new Date(Date.UTC(
    projectStart.getUTCFullYear(),
    projectStart.getUTCMonth(),
    projectStart.getUTCDate(),
    0, 0, 0
  ));

  // 🔒 VŠETKO PRED ZAČIATKOM PROJEKTU → Y00D000
  if (mint < start) {
    return {
      projectYear: 0,
      dayInYear: 0,
      rarityCode: "Y00D000",
    };
  }

  // Candidate year difference
  const candidateYear = mint.getUTCFullYear() - start.getUTCFullYear();

  // Anniversary of the candidate project year
  const anniversary = new Date(Date.UTC(
    start.getUTCFullYear() + candidateYear,
    start.getUTCMonth(),
    start.getUTCDate(),
    0, 0, 0
  ));

  // If the mint date is before this year's anniversary, year hasn't rolled over yet
  let projectYear = candidateYear;
  if (mint < anniversary) {
    projectYear = candidateYear - 1;
  }

  // Start of the selected project year
  const yearStart = new Date(Date.UTC(
    start.getUTCFullYear() + projectYear,
    start.getUTCMonth(),
    start.getUTCDate(),
    0, 0, 0
  ));

  // Day index within this project year
  const msPerDay = 24 * 60 * 60 * 1000;
  const dayInYear = Math.floor((mint.getTime() - yearStart.getTime()) / msPerDay);

  // Build rarity code
  const rarityCode =
    "Y" + String(projectYear).padStart(2, "0") +
    "D" + String(dayInYear).padStart(3, "0");

  return {
    projectYear,
    dayInYear,
    rarityCode,
  };
}

export function getRarityCode(mintDate?: Date) {
  return getRarityInfo(mintDate).rarityCode;
}
