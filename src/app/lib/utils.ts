// Generic utility helpers used across the Matotam app

// Shorten long strings like addresses or asset ids for display
export function shortHash(value: string, start = 10, end = 6): string {
  if (!value) return "";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}
