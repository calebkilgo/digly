// The contract between the game UI and whatever validates answers.
// The server (or the in-browser engine in local mode) owns the clock, the
// answer list and the scores. The client never sees a category before its
// clock starts, and never sees rarity before finish().

export type AttemptMode = "ranked" | "practice";
export type LevelNo = 1 | 2 | 3;

// What the home screen is allowed to know about a level: no category.
export interface LevelSlot {
  level: LevelNo;
  multiplier: number;
  levelName: string;
  scored: number;
  seconds: number;
}

export interface PublicChallenge extends LevelSlot {
  id: string; // `${day}:${level}:${slug}`
  day: number;
  theme: string;
  number: string; // "#028"
  title: string;
  prompt: string;
  noun: string;
  rules: string[];
  opensAt: number;
  closesAt: number;
  scoringVersion: number;
}

export interface Dig {
  day: number;
  number: string;
  levels: LevelSlot[];
}

export interface AttemptStart {
  attemptId: string;
  challenge: PublicChallenge;
  mode: AttemptMode;
  startedAt: number;
  expiresAt: number;
  serverNow: number; // lets the client correct for a skewed clock
  accepted: string[]; // canonical names already found, for resumed attempts
}

export type SubmitStatus = "accepted" | "duplicate" | "rejected" | "expired" | "empty";

export interface SubmitResult {
  status: SubmitStatus;
  canonical?: string; // display name for accepted and duplicate answers
  corrected?: boolean; // the input was auto-corrected to this answer
  acceptedCount: number;
}

export interface RevealedAnswer {
  name: string;
  rarity: number;
  pct?: number; // real share of players who found it, once enough have played
}

export interface AttemptResult {
  attemptId: string;
  challengeId: string;
  challenge: PublicChallenge;
  mode: AttemptMode;
  level: LevelNo;
  multiplier: number;
  score: number; // sum of the scored rarest, before the level multiplier
  points: number; // score x multiplier
  top: RevealedAnswer[]; // rarest first
  accepted: RevealedAnswer[]; // submission order
  rejected: string[];
  missed: RevealedAnswer[]; // a few rare answers this attempt didn't find
  rarest: (RevealedAnswer & { found: boolean })[]; // the day's rarest answers
  finishedAt: number;
}

export interface DigResult {
  day: number;
  mode: AttemptMode;
  levels: AttemptResult[];
  total: number;
}

// Where this player stands on a day's ranked dig.
export interface DayStatus {
  dig: Dig;
  serverNow: number;
  ranked: AttemptResult[]; // finished ranked levels, in order
  next: LevelNo | null; // next ranked level to play, null when done
  total: number; // ranked points so far
}

export interface BoardRow {
  id: string;
  name: string;
  score: number;
  unique: number;
  isYou?: boolean;
  posted?: boolean; // false for a guest's own score, which isn't on the board yet
}

export interface Board {
  day: number;
  entries: BoardRow[];
  sample: boolean; // true when the board is padded with sample diggers
}

export interface ChallengeService {
  readonly kind: "remote" | "local";
  status(day: number): Promise<DayStatus>;
  start(day: number, level: LevelNo, mode: AttemptMode): Promise<AttemptStart>;
  submit(attemptId: string, text: string): Promise<SubmitResult>;
  finish(attemptId: string): Promise<AttemptResult>;
  board(day: number): Promise<Board>;
  account(): Promise<Account>;
  signUp(username: string, password: string, email?: string): Promise<Account>;
  logIn(username: string, password: string): Promise<Account>;
  logOut(): Promise<void>;
}

export interface Account {
  username: string | null; // null while playing as a guest
}

export class GameError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "already_played" | "locked" | "not_open" | "bad_request" | "rate_limited" | "taken" | "bad_login",
    message?: string,
  ) {
    super(message ?? code);
  }
}
