import type { AttemptMode, LevelNo } from "../service/types";

export interface AttemptRow {
  id: string;
  playerId: string;
  day: number;
  level: LevelNo;
  mode: AttemptMode;
  slug: string;
  startedAt: number;
  expiresAt: number;
  finishedAt: number | null;
  score: number | null;
  points: number | null;
  uniqueCount: number;
  submissions: number;
}

export interface PlayerInfo {
  id: string;
  username: string | null;
  isAdmin?: boolean;
  email?: string | null;
  unlimited?: boolean;
}

export interface Purchase {
  id: string; // Stripe Checkout session id
  playerId: string;
  product: string;
  amount: number;
  currency: string;
  paymentIntent: string | null;
}

export interface BoardTotal {
  playerId: string;
  name: string;
  points: number;
  unique: number;
}

// Persistence for the engine. Supabase in production, memory in tests and
// dev, localStorage for the offline preview. Every method is async so the
// engine can't tell them apart.
export interface Store {
  ensurePlayer(playerId: string): Promise<void>;
  getPlayer(playerId: string): Promise<PlayerInfo | null>;
  // turns a guest into an account; StoreConflict if the username is taken
  claimAccount(playerId: string, a: { username: string; passwordHash: string; email: string | null }): Promise<void>;
  findAccount(username: string): Promise<{ playerId: string; username: string; passwordHash: string } | null>;
  createSession(tokenHash: string, playerId: string, expiresAt: number): Promise<void>;
  sessionPlayer(tokenHash: string, now: number): Promise<string | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsFor(playerId: string): Promise<void>;
  // removes the player and everything tied to them (attempts, answers, sessions)
  deletePlayer(playerId: string): Promise<void>;
  // password reset
  findByLogin(usernameOrEmail: string): Promise<{ playerId: string; username: string; email: string | null } | null>;
  setEmail(playerId: string, email: string | null): Promise<void>;
  setPassword(playerId: string, passwordHash: string): Promise<void>;
  createReset(tokenHash: string, playerId: string, expiresAt: number): Promise<void>;
  // one use: returns the player and deletes the token, or null if unknown or expired
  useReset(tokenHash: string, now: number): Promise<string | null>;
  // Digly Unlimited. Both are idempotent: Stripe can deliver an event twice.
  grantUnlimited(p: Purchase): Promise<void>;
  // returns the player who lost access, or null if the payment wasn't ours
  revokeByPaymentIntent(paymentIntent: string): Promise<string | null>;
  // Must throw StoreConflict if a ranked attempt already exists for (player, day, level).
  insertAttempt(row: AttemptRow): Promise<void>;
  getAttempt(id: string): Promise<AttemptRow | null>;
  listAttempts(playerId: string, day: number, mode: AttemptMode): Promise<AttemptRow[]>;
  bumpSubmissions(id: string): Promise<number>;
  // false if this answer is already on the attempt
  addAnswer(attemptId: string, answerId: string): Promise<boolean>;
  listAnswers(attemptId: string): Promise<string[]>; // answer ids, submission order
  addReject(attemptId: string, text: string): Promise<void>;
  listRejects(attemptId: string): Promise<string[]>;
  // Only finishes an unfinished attempt. Returns false if it was already finished.
  finishAttempt(id: string, f: { finishedAt: number; score: number; points: number; uniqueCount: number }): Promise<boolean>;
  // accounts only: guests aren't posted to the board
  dayBoard(day: number, limit: number): Promise<BoardTotal[]>;
  // testing tools: remove a player's own attempts (one day's ranked, or everything)
  deleteAttempts(playerId: string, day: number | null): Promise<void>;
  // ranked attempts at a category before a day, and how many found each answer
  answerStats(slug: string, beforeDay: number): Promise<{ plays: number; counts: Record<string, number> }>;
  // most common inputs that didn't match, for growing the answer lists
  topRejects(slug: string, limit: number): Promise<{ text: string; n: number }[]>;
  // prompt ideas from players (guests too)
  addSuggestion(s: Suggestion): Promise<void>;
  listSuggestions(limit: number): Promise<Suggestion[]>;
  // admin panel
  setSuggestionStatus(id: number, status: SuggestionStatus, by: string, at: number): Promise<boolean>;
  adminStats(day: number): Promise<AdminStats>;
  listAdmins(): Promise<{ id: string; username: string }[]>;
  // returns the player's id, or null if there's no account with that name
  setAdminByUsername(username: string, admin: boolean): Promise<string | null>;
  addAdminLog(e: AdminLogEntry): Promise<void>;
  listAdminLog(limit: number): Promise<AdminLogEntry[]>;
  // attempts started since a time, for the admin panel's live view
  recentAttempts(since: number, limit: number): Promise<LiveAttempt[]>;
  // admin changes to a category's answer list, laid over the list in the code
  listAnswerEdits(slug: string): Promise<AnswerEdit[]>;
  putAnswerEdit(e: AnswerEdit): Promise<void>;
  deleteAnswerEdit(slug: string, key: string): Promise<void>;
}

// One row per answer an admin touched. "add" also covers changing an answer
// that's already in the list; "remove" takes it out. Deleting the row undoes it.
export interface AnswerEdit {
  slug: string;
  key: string; // compact(normalize(name))
  action: "add" | "remove";
  name: string;
  aliases: string[];
  rating: number;
  actor: string;
  at: number;
}

export type SuggestionStatus = "new" | "planned" | "added" | "dismissed";

export interface AdminStats {
  players: number; // everyone who has ever loaded the game
  accounts: number;
  unlimited: number;
  diggersToday: number; // started today's ranked dig
  finishedToday: number; // finished all three levels today
}

export interface LiveAttempt {
  playerId: string;
  level: LevelNo;
  mode: AttemptMode;
  slug: string;
  startedAt: number;
  expiresAt: number;
  finishedAt: number | null;
}

export interface AdminLogEntry {
  actor: string;
  action: string;
  detail: string;
  at: number;
}

export interface Suggestion {
  id?: number;
  playerId: string | null;
  text: string;
  day: number;
  createdAt: number;
  status?: SuggestionStatus;
  updatedBy?: string | null;
  updatedAt?: number | null;
}

export class StoreConflict extends Error {}
