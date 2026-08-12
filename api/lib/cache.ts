import type { SearchResponse } from "@shared/types";
import { createHash } from "crypto";

interface CacheEntry {
  data: SearchResponse;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function hashKey(query: string, maxDuration?: number): string {
  const raw = JSON.stringify({ query, maxDuration });
  return createHash("sha256").update(raw).digest("hex");
}

export function getCached(
  query: string,
  maxDuration?: number
): SearchResponse | null {
  const key = hashKey(query, maxDuration);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(
  query: string,
  data: SearchResponse,
  maxDuration?: number
): void {
  const key = hashKey(query, maxDuration);
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}
