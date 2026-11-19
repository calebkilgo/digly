"use client";

import { PURCHASE_TERMS_VERSION } from "@/game/rules/plans";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiglyScene } from "@/scene/DiglyScene";
import { createService, type AnyService } from "@/game/service";
import { digSlots } from "@/game/service/slots";
import { GameError, type Account, type AttemptMode, type AttemptResult, type DayStatus, type Dig, type DigResult } from "@/game/service/types";
import { dayNumber } from "@/game/rules/schedule";
import { digTotal } from "@/game/rules/levels";
import {
  currentStreak,
  stats,
  EMPTY_PROGRESS,
  forUser,
  loadProgress,
  mergeHistory,
  recordPractice,
  recordVault,
  recordRanked,
  saveProgress,
  type Progress,
} from "@/game/progress";
import { sfx } from "@/audio/sfx";
import { useSettings, useSystemReducedMotion, useVisualViewport } from "./settings";
import { SceneHost } from "./SceneHost";
import { HomeScreen } from "./screens/Home";
import { PregameScreen, primeKeyboard } from "./screens/Pregame";
import { PlayScreen } from "./screens/Play";
import { RevealScreen } from "./screens/Reveal";
import { SummaryScreen, type Rewards } from "./screens/Summary";
import { BoardScreen } from "./screens/Board";
import { VaultScreen } from "./screens/Vault";
import { LogbookScreen } from "./screens/Logbook";
import { SettingsScreen } from "./screens/Settings";
import { AccountSheet, AddEmailSheet, GooglePickSheet, ResetSheet, SuggestSheet } from "./sheets";
import { identify, promptSlug, setScreen as trackScreen, track } from "@/lib/track";
import { ConsentBar } from "./ConsentBar";

export type Screen = "home" | "pregame" | "play" | "reveal" | "summary" | "board" | "vault" | "logbook" | "settings";

export interface Run {
  mode: AttemptMode;
  dig: Dig;
  level: number; // 0..2
  results: AttemptResult[];
  demo?: string[]; // admin demo dig: the category slug for each level
  vault?: number; // Vault game number
}

const MENU_SCREENS: Screen[] = ["home", "board", "vault", "logbook", "settings"];

function recordFrom(status: DayStatus) {
  const levels = status.ranked;
  const last = levels[levels.length - 1];
  const result: DigResult = { day: status.dig.day, mode: "ranked", levels, total: digTotal(levels.map((x) => x.points)) };
  return {
    day: status.dig.day,
    challengeId: String(status.dig.day),
    score: result.total,
    unique: levels.reduce((s, x) => s + x.accepted.length, 0),
    top: levels.flatMap((x) => x.top),
    finishedAt: last?.finishedAt ?? 0,
    result,
  };
}

export function GameShell() {
  useVisualViewport();
  const [service, setService] = useState<AnyService | null>(null);
  const [status, setStatus] = useState<DayStatus | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [unlimited, setUnlimited] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  // the rest of the account (verified email, Google, marketing) for Options
  const [acct, setAcct] = useState<Account | null>(null);
  const [googlePick, setGooglePick] = useState(false);
  const [askEmail, setAskEmail] = useState(false);

  // arriving from a password reset email: ?reset=TOKEN
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("reset");
    if (!t) return;
    setResetToken(t);
    // drop the token from the address bar and history
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const [accountSheet, setAccountSheet] = useState<{ start: "signup" | "login"; reason?: string } | null>(null);
  const [settings, updateSettings] = useSettings();
  const systemRm = useSystemReducedMotion();
  const reduced = settings.motion === "reduced" || (settings.motion === "system" && systemRm);

  const [today, setToday] = useState(() => dayNumber(Date.now()));
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [screen, setScreen] = useState<Screen>("home");
  const [run, setRun] = useState<Run | null>(null);
  const [digResult, setDigResult] = useState<DigResult | null>(null);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [scene, setScene] = useState<DiglyScene | null>(null);
  const [sceneError, setSceneError] = useState(false);
  const announce = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setProgress(loadProgress());
    setToday(dayNumber(Date.now()));
    setMounted(true);
    void createService().then(setService);
  }, []);

  const refresh = useCallback(async () => {
    if (!service) return null;
    try {
      const s = await service.status(dayNumber(Date.now()));
      setStatus(s);
      setNetError(null);
      return s;
    } catch (e) {
      setNetError(e instanceof GameError ? e.message : "Can't reach the mine right now. Check your connection.");
      return null;
    }
  }, [service]);

  useEffect(() => {
    void refresh();
  }, [refresh, today]);

  // Makes the device show `user`'s progress: drops another account's cache,
  // then folds in what the server has, so a new device or a cleared browser
  // shows the same streaks, stats and Vault.
  const syncHistory = useCallback(
    async (user: string | null) => {
      const save = (p: Progress) => {
        setProgress(p);
        saveProgress(p);
      };
      const mine = forUser(loadProgress(), user);
      if (mine !== loadProgress()) save(mine);
      if (!service || service.kind !== "remote") return;
      try {
        const h = await service.history();
        const cur = forUser(loadProgress(), user); // a dig may have finished meanwhile
        const next = mergeHistory(cur, h);
        if (next !== cur || cur.owner !== loadProgress().owner) save(next);
      } catch {
        // offline: the device's own cache still shows
      }
    },
    [service],
  );

  // one place that takes in an account from the server
  const applyAccount = useCallback(
    (a: Account) => {
      setUsername(a.username);
      setAdmin(!!a.admin);
      setEmail(a.email ?? null);
      setUnlimited(!!a.unlimited);
      setAcct(a);
      identify(a.id ?? null, a.username);
      void syncHistory(a.username);
    },
    [syncHistory],
  );

  const reloadAccount = useCallback(async () => {
    if (!service) return;
    try {
      applyAccount(await service.account());
    } catch {
      // keep what's showing
    }
  }, [service, applyAccount]);

  useEffect(() => {
    void reloadAccount();
  }, [reloadAccount]);

  // once a session: nudge an account to add or confirm its email
  useEffect(() => {
    if (!acct?.username || service?.kind !== "remote") return;
    try {
      if (sessionStorage.getItem("digly.emailNudge")) return;
      sessionStorage.setItem("digly.emailNudge", "1");
    } catch {
      return;
    }
    if (!acct.email) setAskEmail(true);
    else if (!acct.emailVerified) setToast(`Check ${acct.email} for a link to confirm your email. You can resend it from Options.`);
  }, [acct, service]);

  const signUp = useCallback(
    async (u: string, p: string, e: string, marketing: boolean) => {
      const a = await service!.signUp(u, p, e, marketing);
      applyAccount(a);
      track("account_created", { method: "password" });
      await refresh();
    },
    [service, refresh, applyAccount],
  );
  const logIn = useCallback(
    async (u: string, p: string) => {
      const a = await service!.logIn(u, p);
      applyAccount(a);
      track("logged_in", { method: "password" });
      await refresh();
    },
    [service, refresh, applyAccount],
  );
  const logOut = useCallback(async () => {
    await service?.logOut();
    setUsername(null);
    setAdmin(false);
    setEmail(null);
    setUnlimited(false);
    setAcct(null);
    identify(null);
    track("logged_out");
    // a logged-out device stops showing the account's history
    void syncHistory(null);
    await refresh();
  }, [service, refresh, syncHistory]);

  // Digly Unlimited: needs an account, then hands off to Stripe Checkout
  const buyUnlimited = useCallback(async () => {
    if (!service) return;
    if (!username) {
      track("post_prompt_shown", { from: "unlimited" });
      setAccountSheet({ start: "signup", reason: "Make an account first, so Digly Unlimited stays with you on every device." });
      return;
    }
    track("checkout_started");
    window.location.href = await service.checkout(PURCHASE_TERMS_VERSION);
  }, [service, username]);

  // back from Stripe: ?unlimited=success&session_id=... or ?unlimited=cancel
  useEffect(() => {
    if (!service) return;
    const q = new URLSearchParams(window.location.search);
    const state = q.get("unlimited");
    if (!state) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (state !== "success") return;
    const sid = q.get("session_id") ?? "";
    void (async () => {
      // the webhook usually beats us here; if not, ask Stripe directly
      for (let i = 0; i < 4; i++) {
        try {
          const a = await service.account();
          if (a.unlimited || (await service.confirmPurchase(sid))) {
            setUnlimited(true);
            setToast("Digly Unlimited is yours. Every Vault door is open. Thanks for supporting Digly!");
            track("purchase_completed");
            return;
          }
        } catch {
          // try again
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setToast("Payment received. Unlimited can take a minute to show up; reopen the Vault shortly.");
    })();
  }, [service]);

  // back from Google (?google=...) or a verification email (?verify=TOKEN)
  useEffect(() => {
    if (!service) return;
    const q = new URLSearchParams(window.location.search);
    const g = q.get("google");
    const v = q.get("verify");
    if (!g && !v) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (g) {
      const said: Record<string, string> = {
        linked: "Google is connected. You can sign in with it next time.",
        exists: "That Google email already has a Digly account. Log in with your password, then connect Google in Options.",
        taken: "That Google account is already connected to another Digly account.",
        noemail: "Google didn't share an email address, so we couldn't make an account.",
        error: "Google sign-in didn't work. Try again in a moment.",
        off: "Google sign-in isn't set up on this site yet.",
      };
      if (g === "pick") setGooglePick(true);
      else if (g === "in") track("logged_in", { method: "google" });
      else if (g === "exists") setAccountSheet({ start: "login" });
      if (said[g]) setToast(said[g]);
    }
    if (v)
      void service.verifyEmail(v).then(
        (r) => {
          setToast("Email confirmed. Thanks!");
          track("email_verified");
          if (r.mine) void reloadAccount();
        },
        (e) => setToast(e instanceof GameError ? e.message : "That link didn't work. Send a new one from Options."),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  // a dig finished on another device (or before a cache wipe) still counts here
  useEffect(() => {
    if (!status || status.next !== null || status.ranked.length !== 3) return;
    const day = status.dig.day;
    const p0 = loadProgress();
    if (p0.ranked[day]) return;
    commitRef.current(recordRanked(p0, recordFrom(status)));
  }, [status]);

  // roll over to the next dig at 00:00 UTC without a reload
  useEffect(() => {
    const id = setInterval(() => {
      const d = dayNumber(Date.now());
      setToday((t) => (t === d ? t : d));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => sfx.setMuted(!settings.sound), [settings.sound]);
  useEffect(() => sfx.setMusicEnabled(settings.music), [settings.music]);
  useEffect(() => scene?.setReducedMotion(reduced), [scene, reduced]);
  useEffect(() => {
    if (scene) scene.onStrike = (power) => sfx.dig(power);
  }, [scene]);
  useEffect(() => {
    document.documentElement.classList.toggle("hc", settings.highContrast);
    document.documentElement.classList.toggle("rm", reduced);
  }, [settings.highContrast, reduced]);

  // music follows the screen; the play screen raises the tempo itself
  useEffect(() => {
    if (MENU_SCREENS.includes(screen) || screen === "pregame" || screen === "summary") sfx.music("menu");
    else if (screen === "reveal") sfx.music("off");
  }, [screen]);

  // the first gesture anywhere unlocks audio
  useEffect(() => {
    const f = () => sfx.unlock();
    window.addEventListener("pointerdown", f, { once: true });
    window.addEventListener("keydown", f, { once: true });
    return () => {
      window.removeEventListener("pointerdown", f);
      window.removeEventListener("keydown", f);
    };
  }, []);

  // the screen rides along on every event, including $pageleave
  useEffect(() => trackScreen(screen), [screen]);

  // closing the tab mid-level is the main way a level gets abandoned
  const playing = screen === "play" && run ? { mode: run.mode, level: run.level + 1, vault: run.vault ?? null } : null;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  useEffect(() => {
    const f = () => {
      if (playingRef.current) track("level_quit", { ...playingRef.current, how: "closed" });
    };
    window.addEventListener("pagehide", f);
    return () => window.removeEventListener("pagehide", f);
  }, []);

  const todayDig = useMemo(() => digSlots(today), [today]);

  // keep the tab title on today's dig if the page stays open past midnight UTC
  useEffect(() => {
    document.title = `Digly ${todayDig.number} · Dig deep.`;
  }, [todayDig.number]);

  const commit = useCallback((p: Progress) => {
    setProgress(p);
    saveProgress(p);
  }, []);
  const commitRef = useRef(commit);

  const say = useCallback((msg: string) => {
    if (announce.current) announce.current.textContent = msg;
  }, []);

  const go = useCallback(
    (s: Screen) => {
      setScreen(s);
      track("screen_viewed", { screen: s });
      if (s === "board") track("board_viewed");
      if (s === "vault") track("vault_opened");
      if (MENU_SCREENS.includes(s)) scene?.setMode("home");
      if (s === "pregame") scene?.setMode("pregame");
    },
    [scene],
  );

  const openPregame = useCallback(
    (mode: AttemptMode, day: number) => {
      // a ranked dig picks up at the server's next level (resume after a closed tab)
      const done = mode === "ranked" && status ? status.ranked : [];
      setRun({ mode, dig: digSlots(day), level: done.length, results: done });
      setDigResult(null);
      scene?.prepareLevel(done.length);
      go("pregame");
    },
    [go, status, scene],
  );

  const onLevelFinished = useCallback(
    (r: AttemptResult) => {
      if (!run) return;
      const results = [...run.results, r];
      setRun({ ...run, results });
      track("level_finished", {
        mode: run.mode,
        level: r.level,
        score: r.score,
        points: r.points,
        finds: r.accepted.length,
        day: run.dig.day,
        prompt: promptSlug(r.challenge.id),
        vault: run.vault ?? null,
      });
      if (results.length === 3) {
        const total = digTotal(results.map((x) => x.points));
        const dr: DigResult = { day: run.dig.day, mode: run.mode, levels: results, total };
        track("dig_finished", { mode: run.mode, total, day: run.dig.day, guest: !username });
        const p0 = loadProgress();
        if (run.mode === "ranked") {
          const next = recordRanked(p0, {
            day: run.dig.day,
            challengeId: String(run.dig.day),
            score: total,
            unique: results.reduce((s, x) => s + x.accepted.length, 0),
            top: results.flatMap((x) => x.top),
            finishedAt: r.finishedAt,
            result: dr,
          });
          commit(next);
          const prev = stats(p0);
          setRewards({ newBest: prev.played > 0 && total > prev.best, first: prev.played === 0, streak: currentStreak(next, run.dig.day) });
        } else if (run.demo) {
          // demo digs don't touch progress or the Vault
          setRewards({ newBest: false, first: false, streak: 0 });
        } else if (run.vault) {
          const prevBest = p0.vaultBest?.[run.vault] ?? 0;
          commit(recordVault(p0, run.vault, total, results.map((x) => x.challenge.title)));
          setRewards({ newBest: prevBest > 0 && total > prevBest, first: false, streak: 0 });
        } else {
          const prevBest = p0.practiceBest[run.dig.day] ?? 0;
          commit(recordPractice(p0, run.dig.day, total, results.map((x) => x.challenge.title)));
          setRewards({ newBest: prevBest > 0 && total > prevBest, first: false, streak: 0 });
        }
        setDigResult(dr);
      }
      setScreen("reveal");
      if (run.mode === "ranked") void refresh();
    },
    [commit, run, refresh, username],
  );

  const nextLevel = useCallback(() => {
    if (!run) return;
    primeKeyboard();
    scene?.prepareLevel(run.level + 1);
    setRun({ ...run, level: run.level + 1 });
    setScreen("play");
  }, [run, scene]);

  const viewToday = useCallback(() => {
    const fromServer = status && status.ranked.length === 3 ? recordFrom(status).result : undefined;
    const dr = fromServer ?? progress.ranked[today]?.result;
    if (!dr || !("levels" in dr)) return;
    setRun({ mode: "ranked", dig: todayDig, level: 2, results: dr.levels });
    setDigResult(dr);
    setRewards(null);
    setScreen("summary");
  }, [progress, today, todayDig, status]);

  // Escape backs out of menu screens
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ["board", "vault", "logbook", "settings", "pregame"].includes(screen)) go("home");
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [screen, go]);

  const loadAll = service ? (id: string) => service.allAnswers(id) : undefined;
  const common = { scene, reduced, say, loadAll };

  // everything below depends on the clock and this device's storage
  if (!mounted) return <div className="app" />;

  const levelResult = run?.results[run.level];

  return (
    <div className="app">
      <SceneHost seed={today} onReady={setScene} onError={() => setSceneError(true)} />
      {sceneError && (
        <p className="note" style={{ position: "absolute", top: 8, left: 8, right: 8, zIndex: 5 }}>
          The underground scene couldn&apos;t start (WebGL unavailable). The game still works.
        </p>
      )}

      {MENU_SCREENS.includes(screen) && (
        <HomeScreen
          {...common}
          hidden={screen !== "home"}
          dig={todayDig}
          status={status}
          netError={netError}
          progress={progress}
          today={today}
          onPlay={() => openPregame("ranked", today)}
          onViewToday={viewToday}
          onNav={go}
          onSuggest={() => setSuggestOpen(true)}
        />
      )}
      {screen === "pregame" && run && (
        <PregameScreen {...common} run={run} onBack={() => go(run.mode === "practice" ? "vault" : "home")} onGo={() => setScreen("play")} />
      )}
      {screen === "play" && run && service && (
        <PlayScreen
          key={`play-${run.level}`}
          {...common}
          run={run}
          service={service}
          onFinished={onLevelFinished}
          onAbort={(m) => {
            track("start_failed", { reason: m.slice(0, 80) });
            go("home");
            void refresh().then(() => setNetError(m));
          }}
        />
      )}
      {screen === "reveal" && run && levelResult && (
        <RevealScreen
          key={`reveal-${run.level}`}
          {...common}
          run={run}
          result={levelResult}
          onNext={nextLevel}
          onSummary={() => setScreen("summary")}
        />
      )}
      {screen === "summary" && run && digResult && (
        <SummaryScreen
          {...common}
          run={run}
          result={digResult}
          rewards={rewards}
          onHome={() => go("home")}
          onBoard={() => go("board")}
          onVault={() => go("vault")}
          service={service}
          username={username}
          onPost={() => {
            track("post_prompt_shown", { from: "summary" });
            setAccountSheet({ start: "signup", reason: "Pick a username to put this score on the board. You keep playing the same way." });
          }}
        />
      )}
      {screen === "board" && (
        <BoardScreen
          service={service}
          today={today}
          dig={todayDig}
          username={username}
          onAccount={() => {
            track("post_prompt_shown", { from: "board" });
            setAccountSheet({ start: "signup", reason: "Pick a username to put your score on the board." });
          }}
          onBack={() => go("home")}
        />
      )}
      {screen === "vault" && (
        <VaultScreen
          progress={progress}
          unlimited={unlimited}
          onBack={() => go("home")}
          onPlay={(n) => {
            setRun({ mode: "practice", dig: { ...digSlots(today), number: `Vault ${n}` }, level: 0, results: [], vault: n });
            setDigResult(null);
            scene?.prepareLevel(0);
            go("pregame");
          }}
          onUnlock={buyUnlimited}
        />
      )}
      {screen === "logbook" && <LogbookScreen progress={progress} today={today} name={username} onBack={() => go("home")} loadTopics={service ? () => service.topics() : undefined} />}
      {screen === "settings" && (
        <SettingsScreen
          settings={settings}
          update={updateSettings}
          systemRm={systemRm}
          onBack={() => go("home")}
          admin={admin}
          unlimited={unlimited}
          onUnlimited={() => go("vault")}
          loadCategories={() => service!.categories()}
          loadSuggestions={() => service!.suggestions()}
          onDemo={(slugs) => {
            setRun({ mode: "practice", dig: digSlots(today), level: 0, results: [], demo: slugs });
            setDigResult(null);
            scene?.prepareLevel(0);
            go("pregame");
          }}
          email={email}
          onDelete={async (pw) => {
            await service!.deleteAccount(pw);
            setUsername(null);
            setAdmin(false);
            setEmail(null);
            setUnlimited(false);
            setAcct(null);
            identify(null);
            track("account_deleted");
            commit({ ...EMPTY_PROGRESS, owner: null });
            await refresh();
          }}
          onEmail={async (e) => {
            applyAccount(await service!.setEmail(e));
          }}
          account={acct}
          onResend={async () => {
            applyAccount(await service!.resendVerify());
          }}
          onMarketing={async (on) => {
            applyAccount(await service!.setMarketing(on));
          }}
          username={username}
          onAccount={(start) => setAccountSheet({ start })}
          onLogOut={logOut}
          onResetToday={async () => {
            await service!.resetDay(today);
            const p = { ...progress, ranked: { ...progress.ranked } };
            delete p.ranked[today];
            commit(p);
            await refresh();
          }}
          onResetAll={async () => {
            await service!.resetAll();
            commit({ ...EMPTY_PROGRESS, owner: progress.owner });
            await refresh();
          }}
        />
      )}
      {accountSheet && service && (
        <AccountSheet
          start={accountSheet.start}
          reason={accountSheet.reason}
          onSignUp={signUp}
          onLogIn={logIn}
          onForgot={(login) => service.forgotPassword(login)}
          onClose={() => setAccountSheet(null)}
          google={!!acct?.googleEnabled}
        />
      )}
      {googlePick && service && (
        <GooglePickSheet
          onPick={async (u, marketing) => {
            applyAccount(await service.finishGoogle(u, marketing));
            track("account_created", { method: "google" });
            await refresh();
          }}
          onClose={() => setGooglePick(false)}
        />
      )}
      {askEmail && service && username && (
        <AddEmailSheet
          onSave={async (e) => {
            applyAccount(await service.setEmail(e));
            setToast(`Saved. Check ${e.trim()} for a link to confirm it.`);
          }}
          onClose={() => setAskEmail(false)}
        />
      )}
      {resetToken && service && (
        <ResetSheet
          onReset={async (pw) => {
            applyAccount(await service.resetPassword(resetToken, pw));
            await refresh();
          }}
          onClose={() => setResetToken(null)}
        />
      )}
      {suggestOpen && service && (
        <SuggestSheet
          onSend={async (t) => {
            await service.suggest(t);
            track("prompt_suggested");
          }}
          onClose={() => setSuggestOpen(false)}
        />
      )}
      {toast && (
        <div className="toast-banner px" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
      <ConsentBar hidden={!MENU_SCREENS.includes(screen)} />
      <div ref={announce} className="sr-only" aria-live="polite" />
    </div>
  );
}
