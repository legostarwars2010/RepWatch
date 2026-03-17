export function buildExternalId(parts: unknown[]): string {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim().length > 0)
    .map((part) => String(part).trim().toLowerCase())
    .join(":");
}

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
