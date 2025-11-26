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

export function decodeQuickBurnIdToUnit(
  quickBurnId: string
): string | null {
  if (!quickBurnId || !/^[A-Za-z0-9\-_]+$/.test(quickBurnId)) {
    return null;
  }

  let b64 = quickBurnId.replace(/-/g, "+").replace(/_/g, "/");
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

  if (id.startsWith("http://") || id.startsWith("https://")) {
    const parts = id.split("/");
    id = parts[parts.length - 1] || "";
  }

  if (!id) return { unit: null, fingerprintLike: false };

  // fingerprint asset1...
  if (/^asset1[0-9a-z]+$/i.test(id)) {
    return { unit: null, fingerprintLike: true };
  }

  if (/^[0-9a-fA-F]+$/.test(id)) {
    return { unit: id, fingerprintLike: false };
  }

  return { unit: null, fingerprintLike: false };
}
