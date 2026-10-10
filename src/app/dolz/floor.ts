import styles from "./dolz.module.css";

/** Red when the market floor is below what the card cost, green when above. */
export function floorClass(floor: number | null | undefined, cost: number | null | undefined): string {
  if (floor == null || cost == null || !(cost > 0)) return "";
  if (floor < cost) return styles.badText;
  if (floor > cost) return styles.goodText;
  return "";
}
