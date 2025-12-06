// src/app/lib/encryption.ts

/**
 * Simple, client-side AES-GCM encryption for matotam messages.
 * - Key is derived from a user-provided passphrase (NEVER stored on-chain).
 * - Only the ciphertext + crypto params are stored in the NFT metadata.
 * - If the passphrase is lost, the message cannot be recovered by anyone.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Generate a cryptographically secure random byte array.
 */
function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

/**
 * Uint8Array <-> base64 helpers for JSON / metadata storage.
 */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(input: string | string[]): Uint8Array {
  // Support both:
  // - single base64 string (old NFTs)
  // - array of 64-char base64 chunks (new segmented NFTs)
  const b64 = Array.isArray(input) ? input.join("") : input;

  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}


/**
 * Shape of the encrypted payload we store inside 721 metadata.
 * This object is fully safe to put on-chain.
 */
export type EncryptedPayload = {
  version: "v1";
  // can be a single base64 string (old NFTs) or an array of 64-char chunks (new NFTs)
  cipherText: string | string[];
  nonce: string;
  salt: string;
  iterations: number;
};

/**
 * Derive an AES-GCM key from a human passphrase using PBKDF2.
 * - Passphrase never leaves the client.
 * - Salt + iterations are public and stored with the ciphertext.
 */
async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations = 210_000
): Promise<CryptoKey> {
  const passphraseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    passphraseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a UTF-8 message string using a passphrase.
 * Returns an EncryptedPayload object that can be stored on-chain.
 */
export async function encryptMessageWithPassphrase(
  plaintext: string,
  passphrase: string
): Promise<EncryptedPayload> {
  const salt = randomBytes(16);  // 128-bit salt for PBKDF2
  const nonce = randomBytes(12); // 96-bit nonce for AES-GCM
  const iterations = 210_000;

  const key = await deriveKeyFromPassphrase(passphrase, salt, iterations);

  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
    },
    key,
    encoder.encode(plaintext)
  );

  const cipherText = uint8ToBase64(new Uint8Array(cipherBuffer));

  return {
    version: "v1",
    cipherText,
    nonce: uint8ToBase64(nonce),
    salt: uint8ToBase64(salt),
    iterations,
  };
}

/**
 * Decrypt a previously encrypted payload using the same passphrase.
 * Throws if the passphrase is wrong or data has been tampered with.
 */
export async function decryptMessageWithPassphrase(
  payload: EncryptedPayload,
  passphrase: string
): Promise<string> {
  if (payload.version !== "v1") {
    throw new Error(`Unsupported encryption version: ${payload.version}`);
  }

  const salt = base64ToUint8(payload.salt);
  const nonce = base64ToUint8(payload.nonce);
  const cipherBytes = base64ToUint8(payload.cipherText);

  const key = await deriveKeyFromPassphrase(
    passphrase,
    salt,
    payload.iterations
  );

  const plainBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce,
    },
    key,
    cipherBytes
  );

  return decoder.decode(plainBuffer);
}
