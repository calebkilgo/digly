// Daily challenges reset at 00:00 UTC. Digly #001 opened on LAUNCH_DAY.
export const LAUNCH_DAY_UTC = Date.UTC(2026, 9, 20); // 2026-10-20
const DAY_MS = 86_400_000;

export function dayNumber(now: number): number {
  return Math.floor((now - LAUNCH_DAY_UTC) / DAY_MS) + 1;
}

export function dayStart(day: number): number {
  return LAUNCH_DAY_UTC + (day - 1) * DAY_MS;
}

export function nextResetAt(now: number): number {
  return dayStart(dayNumber(now) + 1);
}

export function formatChallengeNumber(day: number): string {
  return `#${String(day).padStart(3, "0")}`;
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
