import type { JsonObject } from "../types";

export function parseStrictJson(input: string): JsonObject {
  const parsed = JSON.parse(input) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object.");
  }
  return parsed as JsonObject;
}
