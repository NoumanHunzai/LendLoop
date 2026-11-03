export const SIGNATURE_HEADER = "x-lendloop-signature";
export const TIMESTAMP_HEADER = "x-lendloop-timestamp";
const MAX_SKEW_MS = 5 * 60 * 1000;

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

export async function canonicalString(args: {
  timestamp: string;
  method: string;
  path: string;
  body: string;
}): Promise<string> {
  const bodyHash = await sha256Hex(args.body);
  return `v1:${args.timestamp}:${args.method}:${args.path}:${bodyHash}`;
}

export async function signPayload(secret: string, canonical: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(canonical),
  );
  return toHex(signature);
}

export function freshTimestamp(timestamp: string, now = Date.now()): boolean {
  const value = Number(timestamp);
  return Number.isFinite(value) && Math.abs(now - value) <= MAX_SKEW_MS;
}

export function signaturesMatch(expected: string, received: string): boolean {
  const left = expected.trim().toLowerCase();
  const right = received.trim().toLowerCase().replace(/^sha256=/, "");
  if (left.length === 0 || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
