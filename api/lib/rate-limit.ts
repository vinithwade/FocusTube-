const requestCounts = new Map<string, { count: number; resetAt: number }>();

const MAX_REQUESTS_PER_HOUR = 30;
const WINDOW_MS = 60 * 60 * 1000;

export function checkRateLimit(clientId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = requestCounts.get(clientId);

  if (!entry || now > entry.resetAt) {
    requestCounts.set(clientId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_REQUESTS_PER_HOUR) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true };
}
