import "server-only";
import * as Sentry from "@sentry/nextjs";

// Deletes a player's analytics person and queues deletion of their events
// (PostHog runs event deletion in a weekly batch). Needs a personal API key
// with the person:write scope. Never throws: a deletion request must not fail
// because PostHog is down; the failure goes to Sentry so it can be redone by hand.
export async function deleteAnalytics(distinctIds: string[]) {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const project = process.env.POSTHOG_PROJECT_ID;
  const ids = distinctIds.filter(Boolean);
  if (!key || !project || !ids.length) return false;
  // the private API lives on the app host (us.posthog.com), not the ingest host (us.i.posthog.com)
  const host = (process.env.POSTHOG_APP_HOST || (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(".i.posthog.com", ".posthog.com")).replace(/\/$/, "");
  try {
    const res = await fetch(`${host}/api/projects/${encodeURIComponent(project)}/persons/bulk_delete/?delete_events=true`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ distinct_ids: ids, delete_events: true }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`posthog delete ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    return true;
  } catch (e) {
    console.error(e);
    Sentry.captureException(e, { extra: { distinctIds: ids } });
    return false;
  }
}
