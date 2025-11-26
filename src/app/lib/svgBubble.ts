// ============================================================================
// Matotam — SVG Bubble + Ornament Row (Lab + Mint unified)
// Uses swirlEngine OrnamentParams and buildOrnamentPaths
// ============================================================================

import { buildOrnamentPaths, type OrnamentParams } from "./swirlEngine";

// Split long message into wrapped lines for the bubble
export function wrapMessageForBubble(
  text: string,
  maxLineLength = 44, // trochu kratšie, aby text nepretiekal cez bublinu
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
// Výstup je úmyselne čo najkompaktnejší (bez zbytočných medzier a zalomení),
// aby bol data URI čo najkratší.
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

  const arrowY = bubbleY + bubbleHeight;
  const ornamentBaselineY = arrowY + 56;
  const svgHeight = ornamentBaselineY + 70;
  const centerX = 300;

  const { left, right } = buildOrnamentPaths(
    ornamentParams,
    centerX,
    ornamentBaselineY
  );
  const strokeWidth = ornamentParams.strokeWidth.toFixed(2);

  // Kompaktné path skupiny
  const leftPaths = left
    .map((d) => `<path d="${d}"/>`)
    .join("");
  const rightPaths = right
    .map((d) => `<path d="${d}"/>`)
    .join("");

  // Kompaktné text elementy
  const textElements = safeLines
    .map((line, idx) => {
      const y = startY + idx * lineHeight;
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<text x="50%" y="${y}" text-anchor="middle" fill="#e5e7eb" font-size="22" font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${escaped}</text>`;
    })
    .join("");

  // Celé SVG – jeden skompaktnený string
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${svgHeight}" viewBox="0 0 600 ${svgHeight}"><rect width="100%" height="100%" fill="#020617"/><rect x="${bubbleX}" y="${bubbleY}" width="${bubbleWidth}" height="${bubbleHeight}" rx="40" ry="40" fill="#0b1120" stroke="#0ea5e9" stroke-width="4"/><path d="M260 ${arrowY} L300 ${arrowY + 38} L340 ${arrowY}" fill="#0b1120" stroke="#0ea5e9" stroke-width="4"/>${textElements}<g stroke="#0ea5e9" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round">${leftPaths}${rightPaths}<text x="${centerX}" y="${ornamentBaselineY}" text-anchor="middle" dominant-baseline="middle" fill="#0ea5e9" font-size="18" font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${rarityCode}</text></g></svg>`;
}

// SVG → data URI pre <img src="...">
export function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
}
