// Encode message (UTF-8) to base64 (ASCII-only, safe for metadata)
export function encodeMessageToBase64(message: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(message);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
}

// Decode message back from base64 to UTF-8
export function decodeMessageFromBase64(encoded: string): string {
  let binary: string;

  if (typeof atob === "function") {
    binary = atob(encoded);
  } else {
    binary = Buffer.from(encoded, "base64").toString("binary");
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

// Split ASCII/base64 string into fixed-length chunks
export function splitAsciiIntoSegments(
  text: string,
  maxLength = 64
): string[] {
  const segments: string[] = [];
  for (let i = 0; i < text.length; i += maxLength) {
    segments.push(text.slice(i, i + maxLength));
  }
  return segments;
}

// Prepare a metadata-safe plain-text version of the message
// - keeps standard ASCII characters (including apostrophes)
// - strips emoji and non-ASCII symbols
// - replaces double quotes with single quotes to avoid escaping issues
export function makeSafeMetadataText(
  message: string,
  maxLength = 256
): string {
  if (!message) return "";

  const trimmed = message.trim().slice(0, maxLength);

  // Remove non-ASCII characters (emoji, fancy quotes, etc.)
  let cleaned = trimmed.replace(/[^\x20-\x7E]/g, "");

  // Replace double quotes with single quotes so they are easy to render in JSON/clients
  cleaned = cleaned.replace(/"/g, "'");

  return cleaned;
}
