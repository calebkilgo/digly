import { GameError, type Account, type CategoryInfo, type AttemptMode, type AttemptResult, type AttemptStart, type Board, type ChallengeService, type DayStatus, type LevelNo, type SubmitResult, type FullAnswer } from "./types";

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new Error("offline");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (json && typeof json.error === "string" && json.error !== "server") throw new GameError(json.error, json.message);
    throw new Error(json?.message || `HTTP ${res.status}`);
  }
  return json as T;
}

// Talks to the Next.js API routes. The answer lists live on the server only.
export class RemoteService implements ChallengeService {
  readonly kind = "remote" as const;
  backend: "supabase" | "memory" | null = null;

  async status(day: number) {
    const s = await call<DayStatus & { backend: "supabase" | "memory" }>(`/api/dig?day=${day}`);
    this.backend = s.backend;
    return s;
  }

  start(day: number, level: LevelNo, mode: AttemptMode, opts: { slug?: string; vault?: number } = {}) {
    return call<AttemptStart>("/api/attempts", { method: "POST", body: { day, level, mode, ...opts } });
  }

  async checkout(termsVersion: string) {
    return (await call<{ url: string }>("/api/billing/checkout", { method: "POST", body: { agree: true, terms: termsVersion } })).url;
  }

  async confirmPurchase(sessionId: string) {
    return (await call<{ unlimited: boolean }>(`/api/billing/confirm?session_id=${encodeURIComponent(sessionId)}`)).unlimited;
  }

  async suggest(text: string) {
    await call("/api/suggest", { method: "POST", body: { text } });
  }

  async suggestions() {
    return (await call<{ suggestions: { text: string; day: number; createdAt: number }[] }>("/api/admin/suggestions")).suggestions;
  }

  async categories() {
    return (await call<{ categories: CategoryInfo[] }>("/api/admin/categories")).categories;
  }

  submit(attemptId: string, text: string) {
    return call<SubmitResult>(`/api/attempts/${encodeURIComponent(attemptId)}/submit`, { method: "POST", body: { text } });
  }

  async allAnswers(attemptId: string) {
    return (await call<{ answers: FullAnswer[] }>(`/api/attempts/${encodeURIComponent(attemptId)}/answers`)).answers;
  }

  finish(attemptId: string) {
    return call<AttemptResult>(`/api/attempts/${encodeURIComponent(attemptId)}/finish`, { method: "POST", body: {} });
  }

  async board(day: number): Promise<Board> {
    const b = await call<{ day: number; entries: Board["entries"] }>(`/api/board?day=${day}`);
    return { day: b.day, entries: b.entries, sample: false };
  }

  account() {
    return call<Account>("/api/account");
  }

  signUp(username: string, password: string, email?: string) {
    return call<Account>("/api/account", { method: "POST", body: { action: "signup", username, password, email } });
  }

  logIn(username: string, password: string) {
    return call<Account>("/api/account", { method: "POST", body: { action: "login", username, password } });
  }

  async logOut() {
    await call("/api/account", { method: "POST", body: { action: "logout" } });
  }

  async forgotPassword(login: string) {
    await call("/api/account", { method: "POST", body: { action: "forgot", login } });
  }

  resetPassword(token: string, password: string) {
    return call<Account>("/api/account", { method: "POST", body: { action: "reset", token, password } });
  }

  async deleteAccount(password: string) {
    await call("/api/account", { method: "POST", body: { action: "delete", password } });
  }

  setEmail(email: string) {
    return call<Account>("/api/account", { method: "POST", body: { action: "email", email } });
  }

  // admin-only testing tools; they remove your own runs and keep you logged in
  async resetDay(day: number) {
    await call("/api/admin/reset", { method: "POST", body: { scope: "day", day } });
  }

  async resetAll() {
    await call("/api/admin/reset", { method: "POST", body: { scope: "all" } });
  }
}
