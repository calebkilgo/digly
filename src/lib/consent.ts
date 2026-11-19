// Analytics consent. Players in the EU, EEA, UK and Switzerland are asked
// first; everyone else can turn it off in Options. Global Privacy Control and
// Do Not Track turn it off without asking.

export type Choice = "yes" | "no";

const KEY = "digly.consent";
const REGION_KEY = "digly.region";
export const CONSENT_EVENT = "digly-consent";

// EU + EEA + UK + Switzerland
const ASK = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH".split(" "),
);

export const analyticsConfigured = () => !!process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_DIGLY_BACKEND !== "local";

export function privacySignal() {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || navigator.doNotTrack === "1";
}

export function savedChoice(): Choice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

export function choose(c: Choice) {
  try {
    localStorage.setItem(KEY, c);
  } catch {}
  window.dispatchEvent(new CustomEvent<Choice>(CONSENT_EVENT, { detail: c }));
}

// Whether analytics is running or will run, as far as is known right now.
export function analyticsOn() {
  if (privacySignal()) return false;
  const c = savedChoice();
  if (c) return c === "yes";
  try {
    return sessionStorage.getItem(REGION_KEY) !== "ask";
  } catch {
    return true;
  }
}

// Whether this visitor has to say yes before analytics runs.
export async function mustAsk(): Promise<boolean> {
  try {
    const hit = sessionStorage.getItem(REGION_KEY);
    if (hit) return hit === "ask";
  } catch {}
  let country: string | null = null;
  try {
    const r = await fetch("/api/region", { cache: "no-store" });
    if (r.ok) country = ((await r.json()) as { country: string | null }).country;
  } catch {}
  // no country header (local dev, other hosts): go by the time zone, erring toward asking
  const ask = country ? ASK.has(country.toUpperCase()) : (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "").startsWith("Europe/");
  try {
    sessionStorage.setItem(REGION_KEY, ask ? "ask" : "no");
  } catch {}
  return ask;
}

// Settles once: true if analytics may run now. Waits for the banner when needed.
export async function analyticsAllowed(): Promise<boolean> {
  if (privacySignal()) return false;
  const c = savedChoice();
  if (c) return c === "yes";
  if (!(await mustAsk())) return true;
  return new Promise((resolve) => {
    const f = (e: Event) => {
      window.removeEventListener(CONSENT_EVENT, f);
      resolve((e as CustomEvent<Choice>).detail === "yes");
    };
    window.addEventListener(CONSENT_EVENT, f);
  });
}
