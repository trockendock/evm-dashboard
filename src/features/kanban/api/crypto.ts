/**
 * AES-GCM encryption for Jira API tokens using the browser's WebCrypto API.
 *
 * IMPORTANT: You must add the following variable to your .env.local file before
 * using this feature:
 *
 *   VITE_KANBAN_PEPPER=<a random, secret, high-entropy string>
 *
 * The pepper is used as key material for PBKDF2 key derivation. Keep it secret
 * and stable — changing it invalidates all stored encrypted tokens.
 */

export const PEPPER_ENV_KEY = 'VITE_KANBAN_PEPPER';

/** Reads the pepper from the Vite environment. Throws if not configured. */
export function getPepper(): string {
  const pepper = import.meta.env[PEPPER_ENV_KEY] as string | undefined;
  if (!pepper) {
    throw new Error(
      `Missing environment variable ${PEPPER_ENV_KEY}. ` +
      'Add it to your .env.local file before using the Kanban feature.'
    );
  }
  return pepper;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from the given pepper string using
 * PBKDF2 with a fixed salt and 100 000 iterations.
 */
export async function getKey(pepper: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pepper),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('kanban-token-key'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts a plaintext string with AES-GCM.
 * Returns a base64-encoded string in the format `iv:ciphertext`.
 */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function encrypt(plaintext: string): Promise<string> {
  const pepper = getPepper();
  const key = await getKey(pepper);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  );

  const ivB64 = toBase64(iv);
  const ctB64 = toBase64(new Uint8Array(cipherBuffer));
  return `${ivB64}:${ctB64}`;
}

/**
 * Decrypts a base64-encoded `iv:ciphertext` string produced by `encrypt`.
 */
export async function decrypt(ciphertext: string): Promise<string> {
  const pepper = getPepper();
  const key = await getKey(pepper);

  const [ivB64, ctB64] = ciphertext.split(':');
  if (!ivB64 || !ctB64) {
    throw new Error('Invalid ciphertext format. Expected "iv:ciphertext" in base64.');
  }

  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ct,
  );

  return new TextDecoder().decode(plainBuffer);
}

// Named exports: encrypt, decrypt (no default export)
