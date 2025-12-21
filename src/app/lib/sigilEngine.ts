// app/lib/sigilEngine.ts
// Deterministic sigil generator for Matotam message NFTs.
// - 3 parameter groups: color, interior symbol, frame shape
// - Each option has an explicit probability (rarity)
// - Sigil is derived deterministically from sender address
// - Can render a compact standalone SVG string (e.g. 64x64)

// ---------- Types -----------------------------------------------------

export type SigilColorId =
  | "gold"
  | "royal_purple"
  | "silver"
  | "light_blue"
  | "red"
  | "light_green"
  | "lavender"
  | "brown"
  | "gray"
  | "orange"
  | "dark_blue"
  | "olive_green";

export type SigilInteriorId =
  | "royal_crown"
  | "scroll"
  | "quill"
  | "radiant_burst"
  | "swirl_core"
  | "triad_triskelion"
  | "concentric_rings"
  | "crossed_sigils"
  | "orb_halo"
  | "glyph_matrix"
  | "spiral_tri_loop"
  | "broken_rays";

export type SigilFrameId =
  | "wax"
  | "hexagon"
  | "heptagon"
  | "octagon"
  | "nonagon"
  | "circle"
  | "broken_circle"
  | "trapezoid"
  | "inverted_trapezoid"
  | "gear"
  | "crescent"
  | "double_arc";

export interface SigilColorOption {
  id: SigilColorId;
  label: string;
  // Probability as a fraction (0..1). All options in group sum to 1.
  probability: number;
  // Base colors for fill / stroke.
  fill: string;
  stroke: string;
}

export interface SigilInteriorOption {
  id: SigilInteriorId;
  label: string;
  probability: number;
}

export interface SigilFrameOption {
  id: SigilFrameId;
  label: string;
  probability: number;
}

export interface SigilParams {
  color: SigilColorOption;
  interior: SigilInteriorOption;
  frame: SigilFrameOption;
}

// ---------- Rarity tables (probabilities) ----------------------------
// NOTE: All tables are intended to sum to 1.0 within each group.

// 1) Seal color (background + accent)

export const SIGIL_COLORS: SigilColorOption[] = [
  {
    id: "gold",
    label: "Gold",
    probability: 0.01, // 1 %
    fill: "#facc15",
    stroke: "#fbbf24",
  },
  {
    id: "royal_purple",
    label: "Royal purple",
    probability: 0.045, // 4.5 %
    fill: "#7c3aed",
    stroke: "#a855f7",
  },
  {
    id: "silver",
    label: "Silver",
    probability: 0.045, // 4.5 %
    fill: "#e5e7eb",
    stroke: "#9ca3af",
  },
  {
    id: "light_blue",
    label: "Light blue",
    probability: 0.1,
    fill: "#38bdf8",
    stroke: "#0ea5e9",
  },
  {
    id: "red",
    label: "Red",
    probability: 0.1,
    fill: "#f97373",
    stroke: "#ef4444",
  },
  {
    id: "light_green",
    label: "Light green",
    probability: 0.1,
    fill: "#4ade80",
    stroke: "#22c55e",
  },
  {
    id: "lavender",
    label: "Lavender",
    probability: 0.1,
    fill: "#c7a0ff",
    stroke: "#7b4bcc",
  },
  {
    id: "brown",
    label: "Brown",
    probability: 0.1,
    fill: "#92400e",
    stroke: "#b45309",
  },
  {
    id: "gray",
    label: "Gray",
    probability: 0.1,
    fill: "#6b7280",
    stroke: "#9ca3af",
  },
  {
    id: "orange",
    label: "Orange",
    probability: 0.1,
    fill: "#fb923c",
    stroke: "#f97316",
  },
  {
    id: "dark_blue",
    label: "Dark blue",
    probability: 0.1,
    fill: "#1d4ed8",
    stroke: "#3b82f6",
  },
  {
    id: "olive_green",
    label: "Olive green",
    probability: 0.1,
    fill: "#4d7c0f",
    stroke: "#65a30d",
  },
];

// 2) Interior of the seal

export const SIGIL_INTERIORS: SigilInteriorOption[] = [
  {
    id: "royal_crown",
    label: "Royal crown",
    probability: 0.01, // 1 %
  },
  {
    id: "scroll",
    label: "Scroll",
    probability: 0.045, // 4.5 %
  },
  {
    id: "quill",
    label: "Quill",
    probability: 0.045, // 4.5 %
  },
  {
    id: "radiant_burst",
    label: "Radiant burst",
    probability: 0.1,
  },
  {
    id: "swirl_core",
    label: "Sealed leaf",
    probability: 0.1,
  },
  {
    id: "triad_triskelion",
    label: "Torch",
    probability: 0.1,
  },
  {
    id: "concentric_rings",
    label: "Concentric rings",
    probability: 0.1,
  },
  {
    id: "crossed_sigils",
    label: "Crossed sigils",
    probability: 0.1,
  },
  {
    id: "orb_halo",
    label: "Orb & halo",
    probability: 0.1,
  },
  {
    id: "glyph_matrix",
    label: "Glyph matrix",
    probability: 0.1,
  },
  {
    id: "spiral_tri_loop",
    label: "Spiral tri-loop",
    probability: 0.1,
  },
  {
    id: "broken_rays",
    label: "Broken rays",
    probability: 0.1,
  },
];

// 3) Frame / outline around the seal

export const SIGIL_FRAMES: SigilFrameOption[] = [
  {
    id: "wax",
    label: "Wax blob",
    probability: 0.01, // 1 %
  },
  {
    id: "hexagon",
    label: "Hexagon",
    probability: 0.045, // 4.5 %
  },
  {
    id: "heptagon",
    label: "Heptagon",
    probability: 0.045, // 4.5 %
  },
  {
    id: "octagon",
    label: "Octagon",
    probability: 0.1,
  },
  {
    id: "nonagon",
    label: "Nonagon",
    probability: 0.1,
  },
  {
    id: "circle",
    label: "Circle",
    probability: 0.1,
  },
  {
    id: "broken_circle",
    label: "Broken circle",
    probability: 0.1,
  },
  {
    id: "trapezoid",
    label: "Trapezoid (short top)",
    probability: 0.1,
  },
  {
    id: "inverted_trapezoid",
    label: "Inverted trapezoid",
    probability: 0.1,
  },
  {
    id: "gear",
    label: "Gear",
    probability: 0.1,
  },
  {
    id: "crescent",
    label: "Crescent frame",
    probability: 0.1,
  },
  {
    id: "double_arc",
    label: "Double arc",
    probability: 0.1,
  },
];

// ---------- Helpers: hashing & probability picking -------------------

/**
 * Simple deterministic 32-bit hash of a string.
 * Not cryptographically secure, just for pseudo-randomness.
 */
function hash32(input: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0; // FNV prime, keep 32-bit
  }
  return h >>> 0;
}

/**
 * Use cumulative probabilities to pick one option based on a roll in [0,1).
 */
function pickByProbability<T extends { probability: number }>(
  options: T[],
  roll: number
): T {
  let acc = 0;
  for (const opt of options) {
    acc += opt.probability;
    if (roll < acc) return opt;
  }
  // Fallback to last option in case of floating point drift.
  return options[options.length - 1];
}

/**
 * Derive sigil parameters from a sender address.
 * We use different salt suffixes to get independent rolls per group.
 */
export function getSigilParamsForAddress(address: string): SigilParams {
  const hColor = hash32(address + "|color");
  const hInterior = hash32(address + "|interior");
  const hFrame = hash32(address + "|frame");

  // Normalize to [0,1)
  const rollColor = (hColor >>> 0) / 0xffffffff;
  const rollInterior = (hInterior >>> 0) / 0xffffffff;
  const rollFrame = (hFrame >>> 0) / 0xffffffff;

  const color = pickByProbability(SIGIL_COLORS, rollColor);
  const interior = pickByProbability(SIGIL_INTERIORS, rollInterior);
  const frame = pickByProbability(SIGIL_FRAMES, rollFrame);

  return { color, interior, frame };
}

// ---------- SVG primitives -------------------------------------------

function polygonPath(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation = 0
): string {
  const points: string[] = [];
  const step = (Math.PI * 2) / sides;
  for (let i = 0; i < sides; i++) {
    const angle = rotation + i * step;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

function gearPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  teeth: number
): string {
  const step = (Math.PI * 2) / (teeth * 2);
  const parts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = i * step;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

// ---------- SVG rendering: frame + interior --------------------------

function renderFrame(
  frame: SigilFrameOption,
  cx: number,
  cy: number,
  radius: number,
  color: SigilColorOption
): string {
  const stroke = color.stroke;
  const fill = color.fill;
  const strokeWidth = radius * 0.12;

  switch (frame.id) {
    case "wax": {
      // Wax seal blob – filled SVG path, centered and scaled to the sigil radius.
      const sealPathD = `
M 92.24551,185.93593 C 74.920327,175.34813 53.257006,170.16934 40.738392,153.03031 33.121887,140.95604 30.151289,126.51866 28.735959,112.49283 27.384905,91.886145 36.033337,70.971517 51.823086,57.593342 69.346868,41.600594 94.696292,35.438481 117.73416,40.61661 c 13.49526,2.690862 25.66751,10.084231 34.97168,20.126757 14.48183,14.209146 25.81261,32.545706 28.50957,52.926603 -6.44654,21.856 -17.46676,42.42341 -32.52983,59.55629 -17.98601,7.0984 -36.95294,12.64087 -56.44007,12.70967 z m 14.99454,-11.70011 c 29.9162,-0.5786 56.39825,-27.9237 56.1382,-57.82158 -5.19449,33.08616 -38.18419,59.58706 -71.744624,56.20296 4.651388,3.07622 10.434964,1.48354 15.606424,1.61862 z m 6.95641,-1.90228 c 13.37016,0.0333 21.45357,-12.10718 30.78693,-19.76685 8.43654,-5.58391 0.38692,6.61927 -3.01611,7.91879 -8.28722,5.85619 -17.45915,10.8724 -27.77082,11.84806 z M 35.061313,112.67466 c 1.586361,-4.53089 -2.898316,2.94722 0,0 z m 1.543395,-22.80787 c 9.955635,-21.823422 29.64181,-41.287029 54.375914,-43.9711 4.284175,1.369135 11.722528,-3.002399 3.449225,-3.283075 -19.613533,-1.406786 -37.840528,10.007749 -50.4161,24.210193 -5.228185,6.333343 -9.12643,14.671928 -7.409039,23.043982 z M 150.73771,66.399394 c 3.78577,-4.895687 -4.55491,-0.130971 0,0 z
      `.trim();

      // Measured bounding box for the original path.
      const originalWidth = 153.83; // maxX - minX
      const originalHeight = 150.5; // maxY - minY
      const originalCenterX = 104.3;
      const originalCenterY = 110.69;

      // Diameter we want the blob to occupy (relative to frame radius).
      const targetDiameter = radius * 2 * 0.95;
      const scale = targetDiameter / Math.max(originalWidth, originalHeight);

      const transform = [
        `translate(${cx.toFixed(2)}, ${cy.toFixed(2)})`,
        `scale(${scale.toFixed(4)})`,
        `translate(${-originalCenterX.toFixed(2)}, ${-originalCenterY.toFixed(
          2
        )})`,
      ].join(" ");

      return `
        <path
          d="${sealPathD}"
          transform="${transform}"
          fill="${fill}"
          stroke="${stroke}"
          stroke-width="${strokeWidth.toFixed(2)}"
        />
      `;
    }

    case "hexagon":
      return `<polygon points="${polygonPath(
        cx,
        cy,
        radius,
        6,
        Math.PI / 6
      )}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
        2
      )}" />`;

    case "heptagon":
      return `<polygon points="${polygonPath(
        cx,
        cy,
        radius,
        7
      )}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
        2
      )}" />`;

    case "octagon":
      return `<polygon points="${polygonPath(
        cx,
        cy,
        radius,
        8
      )}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
        2
      )}" />`;

    case "nonagon":
      return `<polygon points="${polygonPath(
        cx,
        cy,
        radius,
        9
      )}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
        2
      )}" />`;

    case "circle":
      return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
        2
      )}" />`;

    case "broken_circle": {
      const r = radius;
      const sw = strokeWidth;
      // Two arcs with a gap on top.
      return [
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${sw.toFixed(
          2
        )}" stroke-dasharray="${(Math.PI * r * 1.4).toFixed(
          2
        )}" stroke-dashoffset="${(Math.PI * r * 0.5).toFixed(2)}" />`,
        `<circle cx="${cx}" cy="${cy}" r="${r * 0.82}" fill="${fill}" stroke="none" />`,
      ].join("");
    }

    case "trapezoid": {
      const wTop = radius * 1.4;
      const wBottom = radius * 2;
      const h = radius * 1.6;
      const x1 = cx - wTop / 2;
      const x2 = cx + wTop / 2;
      const x3 = cx + wBottom / 2;
      const x4 = cx - wBottom / 2;
      const yTop = cy - h / 2;
      const yBottom = cy + h / 2;
      const d = `M ${x1},${yTop} L ${x2},${yTop} L ${x3},${yBottom} L ${x4},${yBottom} Z`;
      return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
        2
      )}" />`;
    }

    case "inverted_trapezoid": {
      const wTop = radius * 2;
      const wBottom = radius * 1.4;
      const h = radius * 1.6;
      const x1 = cx - wTop / 2;
      const x2 = cx + wTop / 2;
      const x3 = cx + wBottom / 2;
      const x4 = cx - wBottom / 2;
      const yTop = cy - h / 2;
      const yBottom = cy + h / 2;
      const d = `M ${x1},${yTop} L ${x2},${yTop} L ${x3},${yBottom} L ${x4},${yBottom} Z`;
      return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
        2
      )}" />`;
    }

    case "gear": {
      const inner = radius * 0.7;
      const outer = radius;
      const path = gearPath(cx, cy, inner, outer, 8);
      return `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
        2
      )}" />`;
    }

    case "crescent": {
      const r = radius;

      const big = `
        <circle
          cx="${cx}"
          cy="${cy}"
          r="${r}"
          fill="${fill}"
          opacity="1"
        />
      `;

      const small = `
        <circle
          cx="${cx + r * 0.4}"
          cy="${cy - r * 0.1}"
          r="${r * 0.8}"
          fill="black"
          opacity="0.7"
        />
      `;

      return big + small;
    }

    case "double_arc": {
      const r1 = radius;
      const r2 = radius * 0.8;
      const sw = strokeWidth;
      const arc1 = `<path d="M ${cx - r1},${cy} A ${r1},${r1} 0 0 1 ${cx +
        r1},${cy}" fill="none" stroke="${stroke}" stroke-width="${sw.toFixed(
        2
      )}" />`;
      const arc2 = `<path d="M ${cx - r2},${cy + r2 * 0.4} A ${r2},${r2} 0 0 0 ${cx +
        r2},${cy + r2 * 0.4}" fill="none" stroke="${stroke}" stroke-width="${(
        sw * 0.8
      ).toFixed(2)}" />`;
      const base = `<circle cx="${cx}" cy="${cy}" r="${radius * 0.75}" fill="${
        fill
      }" />`;
      return base + arc1 + arc2;
    }

    default:
      return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
        2
      )}" />`;
  }
}

function renderInterior(
  interior: SigilInteriorOption,
  cx: number,
  cy: number,
  radius: number,
  color: SigilColorOption
): string {
  // Dark stroke so symbols stand out on any seal color.
  const stroke = "#020617";
  const strokeWidth = radius * 0.12;
  const rInner = radius * 0.6;

  switch (interior.id) {
    // --------------------------------------------------------------
    // 1) Royal crown (legendary)
    // --------------------------------------------------------------
    case "royal_crown": {
      // Royal crown: imported vector path, scaled & centered into the sigil circle.

      const crownPathD = `m 51.152992,135.03647 c -1.798723,-1.96516 -1.814271,-2.01138 -1.814271,-5.3935 v -3.13932 h 53.313539 53.31355 v 2.21203 c 0,3.87911 -0.1898,4.60439 -1.54465,5.90256 l -1.19585,1.14583 H 102.52214 51.818973 Z M 45.999797,118.89688 C 37.896012,104.58264 29.051665,90.384906 19.257794,75.968226 c -1.43345,-2.11005 -2.821113,-4.29012 -3.083696,-4.84459 -0.440745,-0.93069 -0.444929,-1.05772 -0.05447,-1.65365 0.516663,-0.78852 1.390614,-0.83314 2.736401,-0.13969 2.781872,1.43342 4.818105,5.132 4.818105,8.75153 v 1.20866 l 4.431771,1.70071 c 9.6803,3.71486 15.248434,5.29488 18.661623,5.29545 3.366155,5.6e-4 4.811843,-0.94967 7.373174,-4.84628 2.35598,-3.5842 7.104266,-13.20399 7.104266,-14.39289 0,-0.19956 -0.590592,-1.07251 -1.312426,-1.93988 -2.30718,-2.77236 -2.748348,-3.74466 -2.867082,-6.31882 -0.120817,-2.6193 0.44162,-4.52884 1.897773,-6.44316 1.293226,-1.70013 2.079677,-1.66046 3.832892,0.1933 3.314535,3.50464 3.721583,7.10791 1.336661,11.83242 -0.424133,0.8402 -0.771151,1.81618 -0.771151,2.16883 0,1.1189 4.341775,6.84617 8.302346,10.95171 3.750351,3.88762 5.282636,4.64533 8.178387,4.04417 4.610178,-0.95707 12.163153,-8.47883 18.407024,-18.33095 l 1.632988,-2.57667 -1.42024,-1.92124 c -3.649918,-4.93747 -4.37911,-8.16126 -2.644155,-11.68991 0.758267,-1.54221 3.787259,-5.93948 5.067295,-7.35632 1.58275,-1.75191 2.41472,-1.28032 5.61051,3.18023 4.50688,6.29049 4.68191,9.21744 0.86902,14.53181 -0.77119,1.07488 -1.47097,2.22851 -1.55508,2.56361 -0.2666,1.0622 3.49131,6.225 8.18769,11.24866 5.3205,5.69128 9.64963,9.13459 12.54151,9.97528 2.94691,0.85669 4.9734,-0.0839 8.86947,-4.11682 2.27266,-2.35248 6.38953,-7.46495 7.58285,-9.41665 0.28065,-0.459 0.17455,-0.87685 -0.73896,-2.91042 -1.88935,-4.20584 -2.0718,-6.4266 -0.74339,-9.0481 0.77242,-1.52429 3.12226,-4.20041 3.90698,-4.44947 0.62562,-0.19857 1.35251,0.37257 2.20227,1.73039 1.4515,2.31933 2.08319,4.9924 1.68692,7.13842 -0.33746,1.82748 -0.72245,2.58076 -2.54065,4.97115 -1.43673,1.88887 -1.4574,1.94107 -1.16074,2.93125 0.38223,1.27577 4.11364,8.63005 5.98402,11.79399 1.76898,2.9924 3.01318,4.448 4.59876,5.38008 2.41634,1.42046 6.26423,0.84825 15.65435,-2.32791 2.11005,-0.71372 5.14614,-1.81197 6.74687,-2.44057 l 2.91042,-1.14291 0.18137,-2.17664 c 0.12325,-1.47904 0.40327,-2.66258 0.87373,-3.69289 1.44606,-3.16692 4.77818,-5.41316 6.27223,-4.22824 1.09793,0.87077 1.08605,0.89381 -5.49201,10.64948 -8.38802,12.43993 -17.73052,27.559484 -24.3249,39.366474 l -2.91042,5.21099 -53.49508,0.002 -53.49509,0.002 z`;

      const originalWidth = 180;
      const originalHeight = 120;
      const originalCenterX = 100;
      const originalCenterY = 85;

      const targetWidth = rInner * 3.0;
      const scale = targetWidth / originalWidth;

      const transform = [
        `translate(${cx.toFixed(2)}, ${cy.toFixed(2)})`,
        `scale(${scale.toFixed(4)})`,
        `translate(${-originalCenterX.toFixed(2)}, ${-originalCenterY.toFixed(
          2
        )})`,
      ].join(" ");

      return `
        <path
          d="${crownPathD}"
          transform="${transform}"
          fill="${stroke}"
        />
      `;
    }

    // --------------------------------------------------------------
    // 2) Scroll (epic)
    // --------------------------------------------------------------
    case "scroll": {
      const scrollPathD = `
M 131.30195,186.9087 C 104.36532,178.40468 74.17529,186.75244 48.895675,178.8359 28.225925,158.96252 37.941584,127.36517 43.891181,103.19 55.37744,80.142354 21.132991,62.666476 37.383934,41.025969 50.400739,27.086557 70.36187,40.672738 86.473809,40.033079 c 16.243851,1.935302 33.021271,2.074662 48.847411,-2.561951 24.71987,2.264023 20.83918,32.669248 19.44942,50.389988 -0.69838,23.486814 -4.10963,46.899964 -10.2579,69.581994 11.39745,6.71833 33.63073,18.12989 9.31996,27.85915 -7.16332,2.78688 -15.03813,2.30817 -22.53075,1.60644 z m 14.64556,-3.56627 c -13.07929,-14.48853 -5.10751,-34.08203 0.47896,-49.68277 4.06644,-19.26032 4.35105,-38.496023 3.08885,-57.85203 7.39641,-6.701261 -1.0219,-37.472291 -8.24774,-26.28135 7.94009,28.396587 -25.27295,23.259436 -41.965443,22.670717 -18.30873,2.179623 -52.585796,-4.518263 -50.78558,23.883328 -3.161237,23.698425 -15.04736,49.553725 -2.937468,72.485595 13.823512,18.77903 38.237603,4.91932 56.745781,10.3945 14.42934,2.27788 28.93389,5.23848 43.62264,4.38201 z m -20.99556,-3.05575 c -8.59434,-3.88603 -36.878605,-2.69931 -34.277525,-5.68896 14.384925,4.095 41.123505,-3.32038 47.894545,3.93875 -3.41672,3.21536 -9.49551,3.92729 -13.61702,1.75021 z M 49.18372,169.02647 c -10.406213,-7.71993 -2.451235,-46.58263 -2.056846,-19.772 -0.241721,6.61293 -0.716027,13.55851 2.056846,19.772 z m 106.86747,10.88638 c 14.65886,-7.99166 -14.24002,-17.08905 -3.85424,-8.80452 5.53274,0.20127 -1.30464,7.97051 3.85424,8.80452 z M 61.055072,71.460724 C 84.426906,65.755475 112.07407,69.395414 133.22358,67.729931 135.75258,43.193658 113.32614,40.376713 93.905126,45.419209 78.240214,44.754843 61.37412,36.054207 46.290187,40.099428 c 25.140117,4.60718 51.213948,12.086281 76.315593,4.345691 11.10861,11.970678 -23.46296,11.406358 -32.067097,11.381303 -16.559895,3.811334 -47.043234,-13.72512 -54.00621,4.568272 3.449471,9.919898 14.919755,14.375694 24.522599,11.06603 z
      `.trim();

      const originalWidth = 180;
      const originalHeight = 160;
      const originalCenterX = 90;
      const originalCenterY = 110;

      const targetWidth = rInner * 2.8;
      const scale = targetWidth / originalWidth;

      const transform = [
        `translate(${cx.toFixed(2)}, ${cy.toFixed(2)})`,
        `scale(${scale.toFixed(4)})`,
        `translate(${-originalCenterX.toFixed(2)}, ${-originalCenterY.toFixed(
          2
        )})`,
      ].join(" ");

      return `
        <path
          d="${scrollPathD}"
          transform="${transform}"
          fill="${stroke}"
        />
      `;
    }

    // --------------------------------------------------------------
    // 3) Quill (epic)
    // --------------------------------------------------------------
    case "quill": {
      const quillPathD = `
m 60.820174,224.77064 c 10.590673,-11.49249 -0.215569,-27.18742 3.352083,-40.54941 4.518068,-27.10548 14.546977,-53.355 30.866509,-75.6075 8.816404,-10.865385 8.447054,-25.930133 13.463434,-38.593948 1.07866,-5.711857 8.72562,-16.988235 8.0086,-17.329756 -14.91395,9.116061 -27.297455,22.540955 -34.568346,38.486765 2.149411,-15.354033 -8.250708,8.648168 -7.956484,13.829909 -0.625305,5.39662 -0.644104,11.86128 -1.818086,2.70514 -2.772464,-17.10206 -12.50426,6.56662 -13.179898,12.99193 -2.602983,9.43548 1.87611,19.69877 -0.388859,28.63799 -3.563912,-6.21543 -10.256397,-24.143 -14.078955,-7.80726 -4.771174,13.4361 -9.628887,30.78378 -0.561708,43.41402 3.896438,5.87427 22.038795,8.8379 6.369004,11.70117 -8.290996,4.39079 14.010855,2.2466 9.986415,11.82861 0.925817,5.47773 -2.609604,11.13479 0.506291,16.29234 z m -8.800653,-54.93236 c -3.809244,-11.18025 14.409418,12.43857 2.629536,2.6283 l -1.352426,-1.27375 z m 19.774951,25.15819 c 6.05213,-3.76921 16.508952,-13.76766 16.667333,-16.97762 -6.232327,4.08396 -18.028885,7.59872 -16.667333,16.97762 z m -1.24905,-7.74147 c 18.974964,-14.50556 35.701548,-32.72527 45.565358,-54.68418 -8.12342,5.00388 -22.329384,18.83106 -26.369415,18.56829 13.881605,-14.17843 30.891115,-25.65283 41.448025,-42.81322 -18.11922,5.78602 -33.713834,18.35882 -45.581013,32.95804 -9.715983,13.18506 -15.692603,29.47245 -15.062955,45.97107 z m 12.370501,-47.26534 c 19.136367,-26.55051 54.703017,-35.6344 71.562487,-64.343306 6.16689,-11.573833 19.6793,-28.713827 13.15942,-40.415991 -12.57048,-6.153471 -26.317,2.608731 -36.64391,9.503469 -14.27676,11.212152 -22.70114,28.863085 -24.30746,46.773486 13.69511,-11.733349 25.28583,-26.283682 41.43908,-34.870883 -26.72362,23.8465 -52.533377,50.680385 -66.021627,84.467265 l 0.521597,-0.45401 z
      `.trim();

      const originalWidth = 180;
      const originalHeight = 230;
      const originalCenterX = 90;
      const originalCenterY = 120;

      const targetWidth = rInner * 2.4;
      const scale = targetWidth / originalWidth;

      const transform = [
        `translate(${cx.toFixed(2)}, ${cy.toFixed(2)})`,
        `scale(${scale.toFixed(4)})`,
        `translate(${-originalCenterX.toFixed(2)}, ${-originalCenterY.toFixed(
          2
        )})`,
      ].join(" ");

      return `
        <path
          d="${quillPathD}"
          transform="${transform}"
          fill="${stroke}"
        />
      `;
    }

    // --------------------------------------------------------------
    // 4) Radiant burst
    // --------------------------------------------------------------
    case "radiant_burst": {
      const rays: string[] = [];
      const count = 12;
      const r0 = rInner * 0.25;
      const r1 = rInner;
      const step = (Math.PI * 2) / count;

      for (let i = 0; i < count; i++) {
        const angle = i * step;
        const long = i % 2 === 0;
        const start = long ? r0 * 0.7 : r0;
        const end = long ? r1 : r1 * 0.8;

        const x0 = cx + start * Math.cos(angle);
        const y0 = cy + start * Math.sin(angle);
        const x1 = cx + end * Math.cos(angle);
        const y1 = cy + end * Math.sin(angle);
        rays.push(
          `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(
            2
          )}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(
            2
          )}" stroke="${stroke}" stroke-width="${(
            strokeWidth * 0.9
          ).toFixed(2)}" stroke-linecap="round" />`
        );
      }

      const core = `<circle cx="${cx}" cy="${cy}" r="${(
        rInner * 0.28
      ).toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="${(
        strokeWidth * 0.9
      ).toFixed(2)}" />`;

      return core + rays.join("");
    }

    // --------------------------------------------------------------
    // 5) Sealed leaf (epic) – id: "swirl_core"
    // --------------------------------------------------------------
    case "swirl_core": {
      const leafPathD = `
m 55.82076,176.89888 c 5.504068,4.09198 12.614809,1.29387 18.554601,-0.0809 15.893247,-4.85884 29.714399,-18.02509 32.818729,-34.7035 3.39292,-14.06474 4.82962,-28.58897 4.38721,-43.046679 2.80715,8.405429 2.00773,17.495649 1.35283,26.197869 -1.02336,10.0137 -3.36495,19.93168 -7.35033,29.19103 -3.49465,3.03803 -1.54689,7.33243 2.93902,4.59356 13.1371,-3.22446 21.61424,-16.99748 20.99315,-30.12815 0.20662,-18.42467 -5.11746,-36.291321 -9.84281,-53.922251 -1.43818,-4.908016 -3.01823,-9.777255 -4.84698,-14.554609 -14.69237,14.797026 -28.26868,30.910888 -38.997565,48.83544 -4.989176,8.68116 -9.312439,19.39131 -5.28128,29.30144 3.299372,9.09035 10.90291,15.79702 19.095153,20.45043 1.137144,4.81415 -6.106946,7.46712 -9.189863,10.21328 -7.721293,4.5134 -16.780278,6.32204 -25.657407,6.2492 -0.03527,0.66814 0.802834,0.88259 1.025542,1.40385 z
      `.trim();

      const originalWidth = 160;
      const originalHeight = 180;
      const originalCenterX = 90;
      const originalCenterY = 120;

      const targetWidth = rInner * 3.4;
      const scale = targetWidth / originalWidth;

      const transform = [
        `translate(${cx.toFixed(2)}, ${cy.toFixed(2)})`,
        `scale(${scale.toFixed(4)})`,
        `translate(${-originalCenterX.toFixed(2)}, ${-originalCenterY.toFixed(
          2
        )})`,
      ].join(" ");

      return `
        <path
          d="${leafPathD}"
          transform="${transform}"
          fill="${stroke}"
        />
      `;
    }

    // --------------------------------------------------------------
    // 6) Torch (epic) – id: "triad_triskelion"
    // --------------------------------------------------------------
    case "triad_triskelion": {
      const torchPathD = `
m 67.859481,185.3347 c 6.460105,-21.80631 12.984609,-43.59351 19.426796,-65.40514 7.558119,3.71678 19.112673,5.91495 24.186273,10.57582 -10.26807,20.07327 -20.594003,40.11687 -30.928592,60.15596 -4.073184,-1.8203 -9.334246,-3.16201 -12.684477,-5.32664 z m 17.517403,-69.73134 c 4.894807,-4.04126 14.902516,5.27263 21.517066,6.00092 3.67302,1.64924 14.15273,3.52067 7.82747,7.93261 -9.9698,-4.13109 -20.114989,-7.87821 -30.152652,-11.86073 l 0.404058,-1.0364 z m -0.170938,-7.66137 c 2.530174,-7.42401 11.955467,2.74083 17.421424,2.84542 6.78911,2.64685 13.57822,5.2937 20.36733,7.94054 -1.12776,12.49752 -12.62263,1.37912 -19.75867,0.18997 -5.882949,-3.02144 -15.260668,-4.50873 -19.007961,-8.4677 0.325959,-0.83607 0.651918,-1.67215 0.977877,-2.50823 z m 11.148613,-2.03848 c -7.240757,-6.144304 -1.752158,-19.411877 4.632411,-24.931443 3.08095,-2.791869 9.94814,-8.276529 4.49658,-1.337006 -2.28891,4.198346 0.0456,9.655725 2.78058,3.583925 6.06413,-2.210809 14.49551,-7.233277 16.0463,-11.086035 2.88305,3.944504 -6.29931,19.713806 1.78137,13.095207 2.75711,-3.532231 5.58946,-6.667367 4.70974,-0.11943 0.16498,10.917739 -3.66468,22.971882 -13.38272,28.991192 -8.76397,-0.3669 8.50725,-17.9023 -2.23369,-10.30432 -0.0336,-4.529943 3.97491,-15.812972 -0.91465,-17.377271 -0.4934,7.47454 -8.35575,10.302003 -13.47101,14.202491 -1.54269,1.3465 -1.113541,7.67274 -4.444911,5.28269 z m -8.282651,-3.63 C 83.46874,87.044175 93.059912,71.612089 104.96809,62.724081 c 3.65276,-3.077241 7.73634,-5.846433 2.87196,-0.31934 -4.05518,2.882041 -7.905192,19.558893 -2.58191,8.554272 6.42606,-8.797501 19.69291,-11.866666 22.48763,-23.806056 2.7358,-9.399112 3.52053,10.526287 3.43817,13.888997 0.14691,4.667125 -2.29499,18.753089 4.6277,9.873417 1.54534,-3.758721 2.93366,-10.856523 3.54825,-2.775545 3.06715,16.988132 -1.04966,36.665964 -15.44603,47.474264 -8.65834,0.0985 5.94992,-6.86145 5.63837,-11.62265 4.31525,-8.886013 4.49488,-19.102672 3.42173,-28.735681 -2.15086,4.002261 -10.76762,14.590317 -7.51895,3.673913 1.13386,-4.104884 0.93196,-15.935417 -0.57846,-15.013703 -1.27441,9.978871 -12.74236,11.711805 -18.14184,18.385771 -5.65841,1.702159 9.86002,-14.177095 0.11514,-7.699365 -9.87548,4.808611 -18.711314,16.724954 -13.707689,27.819295 1.957733,4.31506 -3.964387,0.59863 -5.070253,-0.14816 z m 5.39615,1.51044 0.03311,0.0483 z
      `.trim();

      const originalWidth = 180;
      const originalHeight = 220;
      const originalCenterX = 100;
      const originalCenterY = 120;

      const targetWidth = rInner * 3.2;
      const scale = targetWidth / originalWidth;

      const transform = [
        `translate(${cx.toFixed(2)}, ${cy.toFixed(2)})`,
        `scale(${scale.toFixed(4)})`,
        `translate(${-originalCenterX.toFixed(2)}, ${-originalCenterY.toFixed(
          2
        )})`,
      ].join(" ");

      return `
        <path
          d="${torchPathD}"
          transform="${transform}"
          fill="${stroke}"
        />
      `;
    }

    // --------------------------------------------------------------
    // 7) Concentric rings
    // --------------------------------------------------------------
    case "concentric_rings": {
      const r1 = rInner * 0.35;
      const r2 = rInner * 0.6;
      const r3 = rInner * 0.9;
      const sw = strokeWidth * 0.85;

      const inner = `<circle cx="${cx}" cy="${cy}" r="${r1.toFixed(
        2
      )}" fill="none" stroke="${stroke}" stroke-width="${sw.toFixed(2)}" />`;
      const mid = `<circle cx="${cx}" cy="${cy}" r="${r2.toFixed(
        2
      )}" fill="none" stroke="${stroke}" stroke-width="${sw.toFixed(2)}" />`;
      const outer = `<circle cx="${cx}" cy="${cy}" r="${r3.toFixed(
        2
      )}" fill="none" stroke="${stroke}" stroke-width="${sw.toFixed(2)}" />`;

      const core = `<circle cx="${cx}" cy="${cy}" r="${(
        r1 * 0.5
      ).toFixed(2)}" fill="${stroke}" />`;

      return outer + mid + inner + core;
    }

    // --------------------------------------------------------------
    // 8) Crossed sigils
    // --------------------------------------------------------------
    case "crossed_sigils": {
      const r = rInner * 0.95;
      const swMain = strokeWidth;
      const swMinor = strokeWidth * 0.75;

      const l1 = `<line x1="${cx - r}" y1="${cy - r}" x2="${cx +
        r}" y2="${cy + r}" stroke="${stroke}" stroke-width="${swMain.toFixed(
        2
      )}" stroke-linecap="round" />`;
      const l2 = `<line x1="${cx + r}" y1="${cy - r}" x2="${cx -
        r}" y2="${cy + r}" stroke="${stroke}" stroke-width="${swMain.toFixed(
        2
      )}" stroke-linecap="round" />`;
      const l3 = `<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy +
        r}" stroke="${stroke}" stroke-width="${swMinor.toFixed(
        2
      )}" stroke-linecap="round" />`;

      const core = `<circle cx="${cx}" cy="${cy}" r="${(
        rInner * 0.2
      ).toFixed(2)}" fill="${stroke}" />`;

      return l1 + l2 + l3 + core;
    }

    // --------------------------------------------------------------
    // 9) Orb & halo
    // --------------------------------------------------------------
    case "orb_halo": {
      const rOrb = rInner * 0.26;
      const rHalo1 = rInner * 0.7;
      const rHalo2 = rInner * 0.95;
      const sw = strokeWidth * 0.9;

      const haloOuter = `<circle cx="${cx}" cy="${cy}" r="${rHalo2.toFixed(
        2
      )}" fill="none" stroke="${stroke}" stroke-width="${(sw * 0.8).toFixed(
        2
      )}" />`;
      const haloInner = `<circle cx="${cx}" cy="${cy}" r="${rHalo1.toFixed(
        2
      )}" fill="none" stroke="${stroke}" stroke-width="${sw.toFixed(2)}" />`;
      const orb = `<circle cx="${cx}" cy="${cy}" r="${rOrb.toFixed(
        2
      )}" fill="${stroke}" />`;

      return haloOuter + haloInner + orb;
    }

    // --------------------------------------------------------------
    // 10) Glyph matrix
    // --------------------------------------------------------------
    case "glyph_matrix": {
      const dots: string[] = [];
      const grid = 3;
      const step = (rInner * 1.2) / (grid - 1);
      const startX = cx - (step * (grid - 1)) / 2;
      const startY = cy - (step * (grid - 1)) / 2;
      const rDot = rInner * 0.08;

      for (let i = 0; i < grid; i++) {
        for (let j = 0; j < grid; j++) {
          const x = startX + i * step;
          const y = startY + j * step;
          dots.push(
            `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(
              2
            )}" r="${rDot.toFixed(2)}" fill="${stroke}" />`
          );
        }
      }

      const core = `<circle cx="${cx}" cy="${cy}" r="${(
        rInner * 0.15
      ).toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="${(
        strokeWidth * 0.8
      ).toFixed(2)}" />`;

      return dots.join("") + core;
    }

    // --------------------------------------------------------------
    // 11) Spiral tri-loop
    // --------------------------------------------------------------
    case "spiral_tri_loop": {
      const loops: string[] = [];
      const baseAngle = (Math.PI * 2) / 3;
      const r0 = rInner * 0.25;
      const r1 = rInner * 0.9;

      for (let i = 0; i < 3; i++) {
        const angle = i * baseAngle;
        const x0 = cx + r0 * Math.cos(angle);
        const y0 = cy + r0 * Math.sin(angle);
        const x1 = cx + r1 * Math.cos(angle + 0.7);
        const y1 = cy + r1 * Math.sin(angle + 0.7);
        const path = `M ${x0},${y0} Q ${cx},${cy} ${x1},${y1}`;
        loops.push(
          `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
            2
          )}" stroke-linecap="round" />`
        );
      }

      const core = `<circle cx="${cx}" cy="${cy}" r="${(
        rInner * 0.18
      ).toFixed(2)}" fill="${stroke}" />`;

      return core + loops.join("");
    }

    // --------------------------------------------------------------
    // 12) Broken rays
    // --------------------------------------------------------------
    case "broken_rays": {
      const rays: string[] = [];
      const count = 8;
      const rStart = rInner * 0.2;
      const rMid = rInner * 0.55;
      const rEnd = rInner * 1.0;
      const step = (Math.PI * 2) / count;

      for (let i = 0; i < count; i++) {
        const angle = i * step;
        const x0 = cx + rStart * Math.cos(angle);
        const y0 = cy + rStart * Math.sin(angle);
        const x1 = cx + rMid * Math.cos(angle + 0.1);
        const y1 = cy + rMid * Math.sin(angle + 0.1);
        const x2 = cx + rEnd * Math.cos(angle + 0.35);
        const y2 = cy + rEnd * Math.sin(angle + 0.35);
        const path = `M ${x0},${y0} L ${x1},${y1} L ${x2},${y2}`;
        rays.push(
          `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
            2
          )}" stroke-linecap="round" />`
        );
      }

      const core = `<circle cx="${cx}" cy="${cy}" r="${(
        rInner * 0.22
      ).toFixed(2)}" fill="${stroke}" />`;

      return core + rays.join("");
    }

    // Fallback: simple inner circle
    default:
      return `<circle cx="${cx}" cy="${cy}" r="${rInner}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(
        2
      )}" />`;
  }
}

/**
 * Render a full sigil SVG as a string.
 * - `size` is the viewBox width/height (e.g. 64)
 * - This SVG can be embedded into the main bubble SVG and scaled to ~15 % width.
 */
export function renderSigilSvg(
  params: SigilParams,
  size = 64
): string {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;

  const frameSvg = renderFrame(params.frame, cx, cy, radius, params.color);
  const interiorSvg = renderInterior(
    params.interior,
    cx,
    cy,
    radius * 0.7,
    params.color
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
${frameSvg}
${interiorSvg}
</svg>`;
}

/**
 * Convenience helper for Sigil Lab:
 * directly get a sigil SVG string from a sender address.
 */
export function getSigilSvgForAddress(
  address: string,
  size = 64
): string {
  const params = getSigilParamsForAddress(address);
  return renderSigilSvg(params, size);
}
