import { DigEngine } from "../engine/engine";
import { BrowserStore } from "../engine/memoryStore";
import { demoBoard } from "../demoBoard";
import { GameError, type Account, type CategoryInfo, type AttemptMode, type Board, type ChallengeService, type LevelNo } from "./types";

const ME = "local";

// Offline preview: the real engine running in the browser against
// localStorage. Answers ship in this bundle, so it is NOT tamper-proof and is
// never used on the deployed site.
export class LocalService implements ChallengeService {
  readonly kind = "local" as const;
  private store = new BrowserStore();
  private engine = new DigEngine(this.store);

  status(day: number) {
    return this.engine.status(ME, day);
  }
  start(day: number, level: LevelNo, mode: AttemptMode, opts: { slug?: string; vault?: number } = {}) {
    // the offline preview has everything open
    return this.engine.start(ME, day, level, mode, { ...opts, unlimited: true });
  }
  async checkout(): Promise<string> {
    throw new GameError("bad_request", "Purchases need the live site.");
  }
  async confirmPurchase() {
    return true;
  }
  async suggest(text: string) {
    await this.engine.suggest(ME, text);
  }
  async suggestions() {
    return (await this.engine.storeRef().listSuggestions(200)).map((s) => ({ text: s.text, day: s.day, createdAt: s.createdAt }));
  }
  async categories(): Promise<CategoryInfo[]> {
    const { SEEDS } = await import("../data/seeds");
    return SEEDS.map((s) => ({ slug: s.slug, title: s.title, level: s.level }));
  }
  submit(attemptId: string, text: string) {
    return this.engine.submit(ME, attemptId, text);
  }
  finish(attemptId: string) {
    return this.engine.finish(ME, attemptId);
  }
  async board(day: number): Promise<Board> {
    const entries = demoBoard(day).map((e) => ({ ...e, posted: true }));
    const s = await this.engine.status(ME, day);
    const { username } = await this.account();
    if (s.ranked.length) {
      entries.push({
        id: ME,
        name: username ?? "Guest",
        score: s.total,
        unique: s.ranked.reduce((n, r) => n + r.accepted.length, 0),
        isYou: true,
        posted: !!username,
      });
    }
    return { day, entries, sample: true };
  }
  // The offline preview fakes accounts on this device so the flow can be tried.
  async account(): Promise<Account> {
    const p = await this.store.getPlayer(ME);
    return { username: p?.username ?? null, admin: true, unlimited: true };
  }
  async signUp(username: string, password: string): Promise<Account> {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new GameError("bad_request", "Usernames are 3 to 16 letters, numbers or underscores.");
    if (password.length < 8) throw new GameError("bad_request", "Passwords need at least 8 characters.");
    await this.store.ensurePlayer(ME);
    await this.store.claimAccount(ME, { username, passwordHash: "offline", email: null });
    return { username };
  }
  async logIn(username: string): Promise<Account> {
    const a = await this.store.findAccount(username);
    if (!a) throw new GameError("bad_login", "No account with that name in this preview.");
    return { username: a.username };
  }
  async logOut() {}
  async forgotPassword() {
    throw new GameError("bad_request", "Password reset needs the live site.");
  }
  async resetPassword(): Promise<Account> {
    throw new GameError("bad_request", "Password reset needs the live site.");
  }
  async deleteAccount() {
    this.store.reset();
  }
  async setEmail(): Promise<Account> {
    throw new GameError("bad_request", "Email needs the live site.");
  }
  async resetDay(day: number) {
    this.store.resetDay(day);
  }
  async resetAll() {
    this.store.reset();
  }
}
