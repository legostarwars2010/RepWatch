export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((value) => value.toString(16).padStart(2, "0")).join("");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([keyA], [keyB]) =>
    keyA.localeCompare(keyB)
  );
  const body = entries
    .map(([key, inner]) => `${JSON.stringify(key)}:${stableStringify(inner)}`)
    .join(",");
  return `{${body}}`;
}

export async function stablePayloadHash(payload: unknown): Promise<string> {
  const serialized = stableStringify(payload);
  return sha256(serialized);
}
