// Quick Burn helpers: unit <-> quickBurnId (base64url, without '=')

export function encodeUnitToQuickBurnId(unitHex: string): string {
  if (!/^[0-9a-fA-F]+$/.test(unitHex) || unitHex.length % 2 !== 0) {
    throw new Error("Invalid unit hex for quickBurnId.");
  }

  let binary = "";
  for (let i = 0; i < unitHex.length; i += 2) {
    const byte = parseInt(unitHex.slice(i, i + 2), 16);
    binary += String.fromCharCode(byte);
  }

  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(binary, "binary").toString("base64");

  // base64url + no padding
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Decode QuickBurnId (base64url) back to unit-hex.
 * Supports:
 *  - single string (user input, old metadata)
 *  - array of strings (64-char chunks from new metadata)
 */
export function decodeQuickBurnIdToUnit(
  quickBurnId: string | string[]
): string | null {
  const raw =
    Array.isArray(quickBurnId) ? quickBurnId.join("") : quickBurnId;

  if (!raw || !/^[A-Za-z0-9\-_]+$/.test(raw)) {
    return null;
  }

  let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) {
    b64 += "=";
  }

  let binary: string;
  try {
    binary =
      typeof atob === "function"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("binary");
  } catch {
    return null;
  }

  let hex = "";
  for (let i = 0; i < binary.length; i++) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

// Helper for parsing Quick Burn input (URL, fingerprint or unit-hex)
export function parseQuickBurnInput(rawInput: string): {
  unit: string | null;
  fingerprintLike: boolean;
} {
  const raw = rawInput.trim();
  if (!raw) return { unit: null, fingerprintLike: false };

  let id = raw;

  // pool.pm URL or similar – take the last path segment
  if (id.startsWith("http://") || id.startsWith("https://")) {
    const parts = id.split("/");
    id = parts[parts.length - 1] || "";
  }

  if (!id) return { unit: null, fingerprintLike: false };

  // fingerprint asset1...
  if (/^asset1[0-9a-z]+$/i.test(id)) {
    return { unit: null, fingerprintLike: true };
  }

  // direct unit hex
  if (/^[0-9a-fA-F]+$/.test(id)) {
    return { unit: id, fingerprintLike: false };
  }

  // everything else = unsupported
  return { unit: null, fingerprintLike: false };
}
