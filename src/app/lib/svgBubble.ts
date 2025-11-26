// ============================================================================
// Matotam — SVG Bubble + Ornament Row (Lab + Mint unified)
// Uses swirlEngine OrnamentParams and buildOrnamentPaths
// ============================================================================

import { buildOrnamentPaths, type OrnamentParams } from "./swirlEngine";

// Split long message into wrapped lines for the bubble
export function wrapMessageForBubble(
  text: string,
  maxLineLength = 42,
  maxLines = 10
): string[] {
  const trimmed = text.slice(0, 256).trim();
  if (!trimmed) return [];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (candidate.length <= maxLineLength) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        if (lines.length >= maxLines) return lines;
      }
      current =
        word.length > maxLineLength ? word.slice(0, maxLineLength) : word;
    }
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

// Build full SVG (bubble + rarity code + mirrored ornaments)
export function buildBubbleSvg(
  lines: string[],
  rarityCode: string,
  ornamentParams: OrnamentParams
): string {
  const safeLines = lines.length > 0 ? lines : ["(empty message)"];
  const lineHeight = 28;

  const bubbleX = 40;
  const bubbleY = 40;
  const bubbleWidth = 520;
  const bubbleHeight = Math.max(200, safeLines.length * lineHeight + 80);

  const centerY = bubbleY + bubbleHeight / 2;
  const totalHeight = (safeLines.length - 1) * lineHeight;
  const startY = centerY - totalHeight / 2;

  const textElements = safeLines
    .map((line, idx) => {
      const y = startY + idx * lineHeight;
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `
        <text x="50%" y="${y}"
          text-anchor="middle"
          fill="#e5e7eb"
          font-size="22"
          font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
          ${escaped}
        </text>`;
    })
    .join("");

  const arrowY = bubbleY + bubbleHeight;

  // Ornament row position (rarity code centered vertically)
  const ornamentBaselineY = arrowY + 56;
  const svgHeight = ornamentBaselineY + 70;
  const centerX = 300;

  const { left, right } = buildOrnamentPaths(
    ornamentParams,
    centerX,
    ornamentBaselineY
  );

  const strokeWidth = ornamentParams.strokeWidth.toFixed(2);

  const leftPaths = left
    .map(
      (d) => `
    <path d="${d}" />`
    )
    .join("");

  const rightPaths = right
    .map(
      (d) => `
    <path d="${d}" />`
    )
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg"
     width="600"
     height="${svgHeight}"
     viewBox="0 0 600 ${svgHeight}">
  <rect width="100%" height="100%" fill="#020617" />

  <!-- unified bubble body + arrow -->
  <path
    d="${
      (() => {
        const cx = centerX;
        const by = bubbleY;
        const bx = bubbleX;
        const bw = bubbleWidth;
        const bh = bubbleHeight;
        const ay = arrowY;

        return [
          `M ${bx + 40} ${by}`,
          `H ${bx + bw - 40}`,
          `Q ${bx + bw} ${by} ${bx + bw} ${by + 40}`,
          `V ${ay - 40}`,
          `Q ${bx + bw} ${ay} ${bx + bw - 40} ${ay}`,
          `H ${cx + 32}`,
          `L ${cx} ${ay + 38}`,
          `L ${cx - 32} ${ay}`,
          `H ${bx + 40}`,
          `Q ${bx} ${ay} ${bx} ${ay - 40}`,
          `V ${by + 40}`,
          `Q ${bx} ${by} ${bx + 40} ${by}`,
          `Z`,
        ].join(" ");
      })()
    }"
    fill="#0b1120"
    stroke="#0ea5e9"
    stroke-width="4"
    stroke-linejoin="round"
  />

  ${textElements}

  <!-- Ornament row: left + right + rarity code -->
  <g stroke="#0ea5e9"
     stroke-width="${strokeWidth}"
     fill="none"
     stroke-linecap="round"
     stroke-linejoin="round">

    ${leftPaths}
    ${rightPaths}

    <text x="${centerX}" y="${ornamentBaselineY}"
      text-anchor="middle"
      dominant-baseline="middle"
      fill="#0ea5e9"
      font-size="18"
      font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
      ${rarityCode}
    </text>
  </g>
</svg>`.trim();
}

// SVG → data URI for <img src="...">
export function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
}
