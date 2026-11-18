/**
 * A random version 4 UUID. `crypto.randomUUID` exists only in secure contexts, so a page
 * served over plain HTTP, such as the dev server on a phone, builds the UUID itself.
 */
export function randomUuid(): string {
  // The DOM types say that randomUUID always exists.
  const maybeSecure: Partial<Pick<Crypto, "randomUUID">> = crypto;
  if (maybeSecure.randomUUID !== undefined) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 9562 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
