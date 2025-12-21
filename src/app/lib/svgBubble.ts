// app/lib/svgBubble.ts
// ============================================================================
// Matotam — SVG Bubble + Ornaments + optional Sigil
// ============================================================================

import { buildOrnamentPaths, type OrnamentParams } from "./swirlEngine";

/**
 * Split message into wrapped lines that fit into the bubble.
 * - Trims the message to 256 characters
 * - Splits into words and fills lines up to maxLineLength
 * - Caps number of lines to maxLines
 */
export function wrapMessageForBubble(
  text: string,
  maxLineLength = 44,
  maxLines = 10
): string[] {
  const trimmed = text.slice(0, 256).trim();
  if (!trimmed) return [];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxLineLength) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
      }
      current = word;

      if (lines.length >= maxLines) {
        break;
      }
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines;
}

/**
 * Build the main Matotam SVG bubble.
 *
 * Includes:
 * - Speech bubble with shadow
 * - Wrapped message text
 * - Symmetric ornament row
 * - Rarity code (YxxDxxx)
 * - Optional sigil under the rarity code (15% width of the bubble)
 */
export function buildBubbleSvg(
  lines: string[],
  rarityCode: string,
  ornamentParams: OrnamentParams,
  sigilSvg?: string
): string {
  const width = 600;
  const height = 420; // increased so the sigil is fully visible

  const centerX = width / 2;

  // Bubble geometry
  const bubbleLeft = 60;
  const bubbleRight = width - 60;
  const bubbleTop = 40;
  const bubbleBottom = 220;

  const bubbleWidth = bubbleRight - bubbleLeft;
  const bubbleHeight = bubbleBottom - bubbleTop;

  // Message vertical layout
  const lineHeight = 20;
  const totalTextHeight = lines.length * lineHeight;
  const contentTop = bubbleTop + 40;
  const contentBottom = bubbleBottom - 40;
  const contentHeight = contentBottom - contentTop;

  const firstLineY =
    contentTop + (contentHeight - totalTextHeight) / 2 + lineHeight * 0.1;

  const messageText = lines
    .map((line, idx) => {
      const y = firstLineY + idx * lineHeight;
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      return `<text x="${centerX}" y="${y}" text-anchor="middle" fill="#e5e7eb" font-size="16" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${escaped}</text>`;
    })
    .join("");

  // Ornaments
  const ornamentBaseY = bubbleBottom + 40;
  const ornamentPaths = buildOrnamentPaths(ornamentParams, centerX, ornamentBaseY);

  const ornamentsSvg = [
    ...ornamentPaths.left.map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#38bdf8" stroke-width="1.1" />`
    ),
    ...ornamentPaths.right.map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#38bdf8" stroke-width="1.1" />`
    ),
  ].join("");

  // Rarity code (YxxDxxx) centered under the ornaments
  const rarityY = ornamentBaseY + 4;
  const rarityText = `<text x="${centerX}" y="${rarityY}" text-anchor="middle" fill="#0ea5e9" font-size="14" letter-spacing="2" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${rarityCode}</text>`;

  // Optional Sigil – under rarity code, ~15% of bubble width, centered
  let sigilFragment = "";
  if (sigilSvg) {
    // Strip outer <svg> wrapper to safely embed in <g>
    const cleaned = sigilSvg
      .replace(/<\?xml[^>]*>/g, "")
      .replace(/<!DOCTYPE[^>]*>/g, "")
      .replace(/<svg[^>]*>/, "")
      .replace(/<\/svg>\s*$/g, "");

    const targetWidth = width * 0.15; // 15% of total width → 90px for width=600
    const baseSize = 64; // assuming sigil viewBox 0 0 64 64
    const scale = targetWidth / baseSize;

    const sigilX = (width - targetWidth) / 2;
    const sigilY = ornamentBaseY + 5;

    sigilFragment = `<g transform="translate(${sigilX.toFixed(
      2
    )},${sigilY.toFixed(2)}) scale(${scale.toFixed(3)})">
${cleaned}
</g>`;
  }

  // Final SVG
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="bubbleShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0f172a" flood-opacity="0.7" />
    </filter>
  </defs>

  <!-- Bubble -->
  <g filter="url(#bubbleShadow)">
    <rect
      x="${bubbleLeft}"
      y="${bubbleTop}"
      width="${bubbleWidth}"
      height="${bubbleHeight}"
      rx="40"
      ry="40"
      fill="#020617"
      stroke="#38bdf8"
      stroke-width="2"
    />
  </g>


  <!-- Message -->
  ${messageText}

  <!-- Ornaments -->
  <g stroke-linecap="round">
    ${ornamentsSvg}
  </g>

  <!-- Rarity code -->
  ${rarityText}

  <!-- Sigil (optional) -->
  ${sigilFragment}
</svg>
`.trim();
}

/**
 * Convert raw SVG markup into a data URI that can be used as <img src="...">
 */
export function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");

  return `data:image/svg+xml,${encoded}`;
}
