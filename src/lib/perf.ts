// Dev-only input timing. On in `next dev`, or anywhere after running
// localStorage.setItem("digly.perf", "1") in the browser console.
let on: boolean | null = null;

export function perfOn() {
  if (on === null) {
    try {
      on = process.env.NODE_ENV !== "production" || localStorage.getItem("digly.perf") === "1";
    } catch {
      on = false;
    }
  }
  return on;
}

let t0 = 0;

export function markKey() {
  if (perfOn()) t0 = performance.now();
}

// keypress -> input cleared (target under 16 ms), then -> next painted frame
export function logCleared(label: string) {
  if (!perfOn() || !t0) return;
  const start = t0;
  const cleared = performance.now() - start;
  t0 = 0;
  requestAnimationFrame(() => {
    const painted = performance.now() - start;
    const flag = cleared < 16 ? "ok" : "SLOW";
    console.info(`[digly perf] ${label}: input cleared ${cleared.toFixed(2)} ms (${flag}), feedback painted ${painted.toFixed(1)} ms`);
  });
}
