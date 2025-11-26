// ============================================================================
// Matotam — Swirl Engine (Final Unified Version)
// Compatible with: ornament lab + mint NFTs
// ============================================================================

export type OrnamentParams = {
  archetypeIndex: number; // 0–7
  amplitude: number;
  curvature: number;
  strokeWidth: number;
  spread: number;
  layers: number;
};

// ---------------------------------------------------------------------------
// 1) Canonical symmetric pair key
// ---------------------------------------------------------------------------
export function canonicalPairKey(a: string, b: string): string {
  const A = (a || "").trim();
  const B = (b || "").trim();
  if (!A && !B) return "pair::empty";
  return A <= B ? `${A}::${B}` : `${B}::${A}`;
}

// ---------------------------------------------------------------------------
// 2) Deterministic hash → 8 bytes
// ---------------------------------------------------------------------------
export function hashStringToBytes(str: string, byteCount = 8): Uint8Array {
  let h = 0 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  const out = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) {
    h = (h * 1664525 + 1013904223 + i) >>> 0;
    out[i] = h & 0xff;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3) Map byte (0–255) → <min,max>
// ---------------------------------------------------------------------------
export function mapByte(v: number, min: number, max: number): number {
  return min + (v / 255) * (max - min);
}

// ---------------------------------------------------------------------------
// 4) Compute ornament parameters for a (sender, receiver, Y, D)
// ---------------------------------------------------------------------------
export function getOrnamentParamsForPair(
  addrA: string,
  addrB: string,
  yearIndex = 0,
  dayIndex = 0
): OrnamentParams {
  const key = canonicalPairKey(addrA, addrB);
  const bytes = hashStringToBytes(key, 8);

  const archetypeIndex = bytes[0] % 8;

  let amplitude = mapByte(bytes[1], 6, 14);
  let curvature = mapByte(bytes[2], 0.30, 0.90);
  let strokeWidth = mapByte(bytes[3], 1.0, 1.35);
  let spread = mapByte(bytes[4], 90, 150);
  let layers = (bytes[5] % 3) + 1;

  // Archetype fine-tuning
  switch (archetypeIndex) {
    case 0: // Soft Wave
      amplitude *= 0.85;
      curvature = mapByte(bytes[2], 0.30, 0.50);
      layers = 1;
      break;

    case 1: // High Wave
      amplitude *= 1.20;
      curvature = mapByte(bytes[2], 0.45, 0.75);
      break;

    case 2: // Swirl
      curvature = mapByte(bytes[2], 0.55, 0.90);
      break;

    case 3: // Twin Swirl
      curvature = mapByte(bytes[2], 0.60, 0.90);
      layers = 2 + (bytes[5] % 2); // 2–3
      break;

    case 4: // Crown Wave
      curvature = mapByte(bytes[2], 0.30, 0.50);
      break;

    case 5: // Leaf Curve
      curvature = mapByte(bytes[2], 0.40, 0.70);
      break;

    case 6: // Minimal Arc
      amplitude = mapByte(bytes[1], 4, 7);
      curvature = mapByte(bytes[2], 0.20, 0.35);
      layers = 1;
      strokeWidth = mapByte(bytes[3], 1.00, 1.15);
      break;

    case 7: // Double Arc
      amplitude = mapByte(bytes[1], 6, 10);
      curvature = mapByte(bytes[2], 0.25, 0.45);
      layers = 2;
      break;
  }

  // Time jitter (breathing effect)
  const jitter = 1 + ((dayIndex % 5) - 2) * 0.01;
  amplitude *= jitter;
  spread *= jitter;

  return {
    archetypeIndex,
    amplitude,
    curvature,
    strokeWidth,
    spread,
    layers,
  };
}

// ---------------------------------------------------------------------------
// 5) Build left + right ornament SVG paths
// ---------------------------------------------------------------------------
export function buildOrnamentPaths(
  params: OrnamentParams,
  centerX: number,
  baseY: number
): { left: string[]; right: string[] } {
  const { archetypeIndex, amplitude, curvature, spread, layers } = params;

  const layerOffset = 4;
  const left: string[] = [];
  const right: string[] = [];

  const make = (dir: -1 | 1, offsetY: number): string => {
    const startX = centerX + dir * 40;
    const endX = centerX + dir * (40 + spread * 0.50);
    const midX1 = centerX + dir * (40 + spread * curvature * 0.30);
    const midX2 = centerX + dir * (40 + spread * curvature * 0.80);

    const y = baseY + offsetY;
    const up = y - amplitude;
    const down = y + amplitude * 0.60;

    switch (archetypeIndex) {
      case 0: // Soft Wave
        return `M ${startX} ${y} C ${midX1} ${up}, ${midX2} ${down}, ${endX} ${y}`;

      case 1: // High Wave
        return `M ${startX} ${y} C ${midX1} ${up - amplitude * 0.20}, ${midX2} ${down + amplitude * 0.10}, ${endX} ${y}`;

      case 2: // Swirl
        return `M ${startX} ${y} C ${midX1} ${up}, ${midX2} ${y}, ${endX - dir * amplitude * 0.60} ${y} S ${endX} ${y - amplitude * 0.40}, ${endX} ${y}`;

      case 3: // Twin Swirl
        return `M ${startX} ${y} C ${midX1} ${up}, ${midX2} ${down}, ${endX - dir * amplitude * 0.80} ${y} S ${endX} ${y - amplitude * 0.60}, ${endX} ${y}`;

      case 4: // Crown Wave
        const peakX = centerX + dir * (40 + spread * 0.30);
        const peakY = y - amplitude * 1.10;
        return `M ${startX} ${y} C ${midX1} ${up}, ${peakX} ${peakY}, ${midX2} ${up} S ${endX} ${down}, ${endX} ${y}`;

      case 5: // Leaf Curve
        return `M ${startX} ${y} C ${midX1} ${up}, ${midX2} ${y}, ${endX - dir * amplitude * 0.40} ${y + amplitude * 0.20}`;

      case 6: // Minimal Arc
        return `M ${startX} ${y} Q ${midX2} ${up}, ${endX} ${y}`;

      case 7: // Double Arc
        return `M ${startX} ${y} Q ${midX1} ${up}, ${midX2} ${y} T ${endX} ${y}`;

      default:
        return `M ${startX} ${y} C ${midX1} ${up}, ${midX2} ${down}, ${endX} ${y}`;
    }
  };

  for (let i = 0; i < layers; i++) {
    const offset = i * layerOffset;
    left.push(make(-1, offset));
    right.push(make(1, offset));
  }

  return { left, right };
}
