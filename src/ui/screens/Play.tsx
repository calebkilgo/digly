"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DiglyScene } from "@/scene/DiglyScene";
import { GameError, type AttemptResult, type AttemptStart, type ChallengeService, type SubmitStatus } from "@/game/service/types";
import { URGENT_MS, remainingMs } from "@/game/rules/timer";
import { DEPTH_MAX_M, LEVELS } from "@/game/rules/levels";
import { sfx } from "@/audio/sfx";
import { reportError, track } from "@/lib/track";
import { quickMatch } from "@/game/rules/quickCheck";
import { useSceneInsets } from "../SceneHost";
import { CheckMark, Icon, OreIcon } from "../art";
import type { Run } from "../GameShell";

interface Feedback {
  status: SubmitStatus;
  text: string;
  key: number;
  corrected?: boolean;
}

const COMBO_WINDOW_MS = 3500;
const MILESTONES: Record<number, string> = { 5: "Nice!", 10: "Great!", 15: "Amazing!", 20: "Unstoppable!", 25: "Legendary!", 30: "Mythic!" };

export function PlayScreen(props: {
  scene: DiglyScene | null;
  run: Run;
  service: ChallengeService;
  say: (m: string) => void;
  onFinished: (r: AttemptResult) => void;
  onAbort: (message: string) => void;
}) {
  const { scene, run, service, say } = props;
  // before DIG only the level's shape is known; the category comes from the server
  const ch = run.dig.levels[run.level];
  const gaugeMarker = useRef<HTMLDivElement>(null);
  const gaugeText = useRef<HTMLSpanElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  useSceneInsets(scene, top, dock);

  const [count3, setCount3] = useState<number | null>(3); // 3,2,1,0 then null
  const [attempt, setAttempt] = useState<AttemptStart | null>(null);
  const [count, setCount] = useState(0);
  const [secs, setSecs] = useState(ch.seconds);
  // last 10 seconds are urgent, or the last third of a short level
  const urgentMs = Math.min(URGENT_MS, ch.seconds * 350);
  const [urgent, setUrgent] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [armStop, setArmStop] = useState(false);
  const [combo, setCombo] = useState(0);
  const [banner, setBanner] = useState<{ n: number; text: string; key: number } | null>(null);
  const [flyers, setFlyers] = useState<{ id: number; x: number; y: number; dx: number; dy: number }[]>([]);
  const started = useRef(false);
  const urgentMusic = useRef(false);
  const ended = useRef(false);
  const fbKey = useRef(0);
  const lastHit = useRef(0);
  const comboRef = useRef(0);
  const found = useRef(new Set<number>()); // answer numbers found this level
  const pending = useRef(new Set<Promise<unknown>>()); // submits still in flight

  const cbs = useRef(props);
  cbs.current = props;

  // 3, 2, 1, DIG. The category and the clock appear together on DIG.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const steps = [3, 2, 1, 0];
    steps.forEach((n, i) =>
      setTimeout(() => {
        setCount3(n);
        sfx.count(n);
        if (n === 0) {
          setWaiting(true);
          const t0 = Date.now();
          service
            .start(run.dig.day, ch.level, run.mode, run.demo?.[run.level])
            .then((a) => {
              // run the clock on server time: offset by the skew, assuming the reply took half the round trip
              const skew = a.serverNow - (t0 + Date.now()) / 2;
              setAttempt({ ...a, expiresAt: a.expiresAt - skew });
              setWaiting(false);
              track("dig_started", { mode: run.mode, level: ch.level, day: run.dig.day, resumed: a.accepted.length > 0 });
              for (const n of a.found ?? []) found.current.add(n);
              if (a.accepted.length) {
                setCount(a.accepted.length);
                setRecent([...a.accepted].reverse().slice(0, 8));
              }
              void scene?.rev();
              sfx.music("dig", ch.level);
              say(`Go! Level ${ch.level}. ${a.challenge.prompt} ${ch.seconds} seconds. Top ${ch.scored} count.`);
              setTimeout(() => setCount3(null), 450);
            })
            .catch((e) => {
              setWaiting(false);
              if (!(e instanceof GameError)) reportError(e, "start");
              cbs.current.onAbort(e instanceof GameError ? e.message : "Couldn't reach the mine. Check your connection and try again.");
            });
        }
      }, i * 550),
    );
  }, [service, run, scene, say]);

  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  const finish = useCallback(async () => {
    if (ended.current || !attempt) return;
    ended.current = true;
    setOver(true);
    sfx.timeUp();
    say("Time! Counting your finds.");
    const settle = Promise.allSettled([...pending.current]);
    const [, r] = await Promise.all([scene ? scene.endRound() : Promise.resolve(), settle.then(() => finishWithRetry(service, attempt.attemptId))]);
    if (r) cbs.current.onFinished(r);
    else cbs.current.onAbort("Lost the connection while counting. Your finds are saved; open the dig again to see them.");
  }, [attempt, scene, service, say]);

  // clock
  useEffect(() => {
    if (!attempt) return;
    let raf = 0;
    let lastSec = 61;
    const loop = () => {
      const rem = remainingMs(attempt.expiresAt, Date.now());
      const s = Math.ceil(rem / 1000);
      if (s !== lastSec) {
        lastSec = s;
        setSecs(s);
        const u = rem <= urgentMs && rem > 0;
        setUrgent(u);
        scene?.setUrgent(u, s <= 5);
        if (u) sfx.tick(s <= 5);
        if (rem <= urgentMs && !urgentMusic.current) {
          urgentMusic.current = true;
          sfx.music("dig", ch.level, true);
        }
        if (s === 30) say("30 seconds left.");
        if (s === 10) say("10 seconds left.");
      }
      if (rem <= 0) {
        void finish();
        return;
      }
      updateGauge();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, finish, scene, say]);

  // depth gauge: written straight to the DOM every frame, no re-render
  const updateGauge = () => {
    if (!scene || !gaugeMarker.current || !gaugeText.current) return;
    const m = scene.getDepthM();
    gaugeMarker.current.style.top = `${Math.min(100, (m / DEPTH_MAX_M) * 100)}%`;
    gaugeText.current.textContent = `${Math.round(m)} m`;
  };
  useEffect(() => {
    let raf = 0;
    const f = () => {
      updateGauge();
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // combo fades if you stall
  useEffect(() => {
    if (!combo) return;
    const id = setTimeout(() => {
      comboRef.current = 0;
      setCombo(0);
    }, COMBO_WINDOW_MS);
    return () => clearTimeout(id);
  }, [combo, count]);

  const flyOre = () => {
    const from = input.current?.getBoundingClientRect();
    const to = counterRef.current?.getBoundingClientRect();
    const app = input.current?.closest(".app")?.getBoundingClientRect();
    if (!from || !to || !app) return;
    const x = from.left - app.left + 30;
    const y = from.top - app.top;
    const id = Date.now() + Math.random();
    setFlyers((f) => [...f, { id, x, y, dx: to.left - app.left + to.width / 2 - x - 9, dy: to.top - app.top + to.height / 2 - y - 8 }]);
    setTimeout(() => setFlyers((f) => f.filter((q) => q.id !== id)), 450);
  };

  // the find effects, shared by instant and server-confirmed answers
  const celebrate = (name: string, corrected?: boolean) => {
    const n = found.current.size;
    const now = Date.now();
    comboRef.current = now - lastHit.current < COMBO_WINDOW_MS ? comboRef.current + 1 : 1;
    lastHit.current = now;
    fbKey.current++;
    setCombo(comboRef.current);
    setCount(n);
    setRecent((x) => [name, ...x].slice(0, 8));
    setFeedback({ status: "accepted", text: name, key: fbKey.current, corrected });
    scene?.valid();
    sfx.valid(comboRef.current - 1);
    flyOre();
    const m = MILESTONES[n];
    if (m) {
      setBanner({ n, text: m, key: fbKey.current });
      setTimeout(() => sfx.milestone(n / 5), 120);
      scene?.milestone();
    }
    say(`Found ${name}${corrected ? ", corrected spelling" : ""}. ${n} finds.${m ? ` ${m}` : ""}`);
  };

  const duplicate = (name: string) => {
    fbKey.current++;
    setFeedback({ status: "duplicate", text: name, key: fbKey.current });
    sfx.duplicate();
    say(`Already found ${name}.`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const el = input.current;
    if (!el) return;
    const text = el.value;
    el.value = "";
    el.focus({ preventScroll: true });
    if (!attempt || over || !text.trim()) return;

    // Instant path: the fingerprint check knows it's an answer, so show it now
    // and let the server confirm (and supply the proper name) in the background.
    const num = attempt.check ? quickMatch(attempt.check, text) : null;
    if (num !== null) {
      const shown = tidy(text);
      if (found.current.has(num)) return duplicate(shown);
      found.current.add(num);
      celebrate(shown);
      const job = service.submit(attempt.attemptId, text).then(
        (r) => {
          if (r.status === "accepted" || r.status === "duplicate") {
            if (r.canonical && r.canonical !== shown) {
              setRecent((x) => x.map((w) => (w === shown ? r.canonical! : w)));
              setFeedback((f) => (f && f.text === shown ? { ...f, text: r.canonical!, corrected: r.corrected } : f));
            }
          } else if (r.status === "rejected") {
            // shouldn't happen; trust the server
            found.current.delete(num);
            setCount(found.current.size);
            setRecent((x) => x.filter((w) => w !== shown));
          }
        },
        () => {},
      );
      pending.current.add(job);
      void job.finally(() => pending.current.delete(job));
      return;
    }

    // Slow path: typos, sound-alikes and misses need the server's matcher.
    let r;
    const job = service.submit(attempt.attemptId, text);
    pending.current.add(job);
    try {
      r = await job;
    } catch {
      fbKey.current++;
      setFeedback({ status: "rejected", text: "connection blip, try again", key: fbKey.current });
      return;
    } finally {
      pending.current.delete(job);
    }
    if (ended.current && r.status !== "accepted") return;
    if (r.status === "accepted") {
      if (r.num !== undefined) found.current.add(r.num);
      else found.current.add(-1 - found.current.size);
      celebrate(r.canonical!, r.corrected);
    } else if (r.status === "duplicate") {
      duplicate(r.canonical!);
    } else if (r.status === "rejected") {
      fbKey.current++;
      comboRef.current = 0;
      setCombo(0);
      setFeedback({ status: "rejected", text: text.trim(), key: fbKey.current });
      scene?.invalid();
      sfx.invalid();
      say("No match.");
    } else if (r.status === "expired") {
      void finish();
    }
  };

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 1300);
    return () => clearTimeout(id);
  }, [banner]);

  useEffect(() => {
    if (!armStop) return;
    const id = setTimeout(() => setArmStop(false), 3000);
    return () => clearTimeout(id);
  }, [armStop]);

  const live = !!attempt && !over;
  const segsOn = Math.ceil((secs / ch.seconds) * 12);

  return (
    <div className={`layer lvl-${ch.level}`}>
      <div className="hud-top" ref={top}>
        <div className="counter px" ref={counterRef} aria-label={`${count} finds`}>
          <Icon name="cart" size={3} />
          <span className={`n ${count ? "bump" : ""}`} key={`n${count}`}>
            {count}
          </span>
          {combo >= 2 && (
            <span className="combo" key={`c${combo}`}>
              COMBO x{combo}
            </span>
          )}
        </div>
        <div className="hud-prompt px">
          <div className="row">
            <span className="label lv-label">
              Level {ch.level} · x{ch.multiplier}
              {run.mode === "practice" ? " · practice" : ""}
            </span>
            <button
              type="button"
              className={`stop ${armStop ? "arm" : ""}`}
              disabled={!live}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                if (armStop) void finish();
                else setArmStop(true);
                input.current?.focus({ preventScroll: true });
              }}
            >
              {armStop ? "Tap to stop" : "Stop"}
            </button>
          </div>
          {attempt ? (
            <p className="reveal" aria-live="polite">
              {attempt.challenge.prompt}
            </p>
          ) : (
            <p style={{ color: "#8a7fa6" }}>{waiting ? "Opening the vein…" : "Category revealed on DIG…"}</p>
          )}
        </div>
        <div className={`clock px ${urgent ? "urgent" : ""}`} role="timer" aria-label={`${secs} seconds left`}>
          <span className="digits" aria-hidden>
            <span key={urgent ? secs : "steady"} style={{ display: "inline-block" }}>
              {secs}
            </span>
          </span>
          <span className="segs" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} className={i < segsOn ? "" : "off"} />
            ))}
          </span>
        </div>
      </div>

      <div className="spacer" />

      <form className="dock px dark" ref={dock} onSubmit={submit} autoComplete="off">
        <div className="feed" aria-hidden>
          {feedback && (
            <>
              <span key={feedback.key} className={`stamp ${feedback.status === "accepted" ? "ok" : feedback.status === "duplicate" ? "dup" : "no"}`}>
                {feedback.status === "accepted" && <CheckMark />}
                {feedback.status === "accepted" ? "Found" : feedback.status === "duplicate" ? "Already dug" : "No match"}
                {feedback.corrected && <span className="fix">fixed</span>}
              </span>
              <span className="word">{feedback.text}</span>
            </>
          )}
          {!feedback && <span className="label" style={{ color: "#8a7fa6" }}>{live ? "Type and press Enter" : ""}</span>}
          <div className="chips">
            {recent.slice(feedback?.status === "accepted" ? 1 : 0, 6).map((r) => (
              <span className="chip" key={r}>
                {r}
              </span>
            ))}
          </div>
        </div>
        <div className="entry">
          <label className="slot">
            <span className="sr-only">Your answer: {attempt ? attempt.challenge.prompt : "waiting for the category"}</span>
            <input
              ref={input}
              type="text"
              inputMode="text"
              enterKeyHint="go"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={60}
              placeholder={over ? "Time!" : attempt ? `name ${attempt.challenge.noun}…` : "get ready…"}
              disabled={over}
              onBlur={() => {
                if (!ended.current && document.activeElement === document.body) {
                  setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
                }
              }}
            />
          </label>
          <button type="submit" className="btn btn-go dig-btn" disabled={over} onPointerDown={(e) => e.preventDefault()}>
            DIG
          </button>
        </div>
      </form>

      <div className="depth-gauge" aria-hidden>
        {LEVELS.map((l, i) => {
          const end = LEVELS[i + 1]?.startM ?? DEPTH_MAX_M;
          return (
            <div
              key={l.n}
              className={`seg-lv lv${l.n} ${l.n === ch.level ? "on" : ""}`}
              style={{ top: `${(l.startM / DEPTH_MAX_M) * 100}%`, height: `${((end - l.startM) / DEPTH_MAX_M) * 100}%` }}
            >
              <span>{l.n}</span>
            </div>
          );
        })}
        <div className="marker" ref={gaugeMarker}>
          <span ref={gaugeText}>0 m</span>
        </div>
      </div>

      {count3 !== null && (
        <div className="countdown" aria-hidden>
          <div className="lv-intro">
            <div className="lv-title">
              Level {ch.level} · {ch.levelName}
            </div>
            <div className="lv-mult">
              {ch.seconds}s · top {ch.scored} count · x{ch.multiplier}
            </div>
          </div>
          <span className="big-num" key={count3}>
            {count3 === 0 ? (waiting ? "…" : "DIG!") : count3}
          </span>
        </div>
      )}
      {banner && (
        <div className="banner" key={banner.key} aria-hidden>
          <div className="big-num">{banner.text}</div>
          <div className="sub">{banner.n} finds</div>
        </div>
      )}
      {flyers.map((f) => (
        <span key={f.id} className="flyer" style={{ left: f.x, top: f.y, ["--dx" as string]: `${f.dx}px`, ["--dy" as string]: `${f.dy}px` }}>
          <OreIcon size={3} />
        </span>
      ))}
    </div>
  );
}

async function finishWithRetry(service: ChallengeService, id: string): Promise<AttemptResult | null> {
  for (let i = 0; i < 4; i++) {
    try {
      return await service.finish(id);
    } catch (e) {
      if (e instanceof GameError) return null;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  return null;
}

// what the player typed, tidied for the instant stamp until the server sends the real name
function tidy(text: string) {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(^|[\s-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
}
