export const ROUND_MS = 60_000; // default; each level sets its own length
// Grace window for a submission that left the client right at zero.
export const LATE_GRACE_MS = 350;
export const URGENT_MS = 10_000;

export function expiresAt(startedAt: number, roundMs = ROUND_MS): number {
  return startedAt + roundMs;
}

export function isAcceptingSubmissions(expires: number, now: number): boolean {
  return now <= expires + LATE_GRACE_MS;
}

export function remainingMs(expires: number, now: number): number {
  return Math.max(0, expires - now);
}
