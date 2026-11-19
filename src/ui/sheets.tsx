"use client";

import { useEffect, useRef, useState } from "react";
import type { AttemptResult, DigResult, FullAnswer, PublicChallenge, RevealedAnswer } from "@/game/service/types";
import { SCORING, foundLabel, pointsOf, tierOf } from "@/game/rules/scoring";
import { sfx } from "@/audio/sfx";
import { GemIcon } from "./art";
import { GemLadder } from "./GemLadder";
import { shareImage, shareText, siteName, subline } from "./share";

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet px" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn btn-sm btn-dark" onClick={onClose} ref={close}>
            Close
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </section>
    </>
  );
}

function Row({ a, cls }: { a: RevealedAnswer; cls?: string }) {
  const t = tierOf(a);
  return (
    <li className={cls}>
      <GemIcon tier={t.key} size={2} />
      <span>
        {a.name}
        <br />
        <span className="p">{a.deep ? `Deep cut +${SCORING.deepCut} · ${foundLabel(a)}` : foundLabel(a)}</span>
      </span>
      <span className="r">{pointsOf(a)}</span>
    </li>
  );
}

function LevelAnswers({ result }: { result: AttemptResult }) {
  const rarest = result.rarest ?? [];
  const mine = [...result.accepted].sort((a, b) => b.rarity - a.rarity);
  return (
    <>
      <div>
        <h3>The 20 rarest · you found {rarest.filter((r) => r.found).length}</h3>
        <ul className="finds">
          {rarest.map((a) => (
            <Row key={a.name} a={a} cls={a.found ? "yours" : "locked"} />
          ))}
        </ul>
      </div>
      <div>
        <h3>Your finds</h3>
        {mine.length ? (
          <ul className="finds">
            {mine.map((a) => (
              <Row key={a.name} a={a} cls="yours" />
            ))}
          </ul>
        ) : (
          <p className="rejected">Nothing dug on this level.</p>
        )}
      </div>
      {result.rejected.length > 0 && (
        <div>
          <h3>Didn&apos;t match</h3>
          <p className="rejected">{result.rejected.join(", ")}</p>
        </div>
      )}
    </>
  );
}

// Every answer in a level's list, rarest first, loaded when asked for.
function AllAnswers({ attemptId, load }: { attemptId: string; load: (id: string) => Promise<FullAnswer[]> }) {
  const [list, setList] = useState<FullAnswer[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    let live = true;
    setList(null);
    load(attemptId).then(
      (a) => live && setList(a),
      () => live && setErr("Couldn't load the answers."),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);
  if (err) return <p className="rejected">{err}</p>;
  if (!list) return <p className="fine">Loading every answer…</p>;
  const needle = q.trim().toLowerCase();
  const shown = needle ? list.filter((a) => a.name.toLowerCase().includes(needle)) : list;
  return (
    <div>
      <h3>
        All {list.length} answers · you found {list.filter((a) => a.found).length}
      </h3>
      <input className="all-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the list" aria-label="Search the answers" />
      <ul className="finds">
        {shown.map((a) => (
          <Row key={a.name} a={a} cls={a.found ? "yours" : "locked"} />
        ))}
      </ul>
    </div>
  );
}

// The rarest answers, one tab per level, plus the full list when a loader is given.
export function AnswersSheet({
  levels,
  results,
  start = 0,
  onClose,
  loadAll,
}: {
  levels: PublicChallenge[];
  results: AttemptResult[];
  start?: number;
  onClose: () => void;
  loadAll?: (attemptId: string) => Promise<FullAnswer[]>;
}) {
  const [tab, setTab] = useState(Math.min(start, results.length - 1));
  const [view, setView] = useState<"rarest" | "all">("rarest");
  return (
    <Sheet title="Answers" onClose={onClose}>
      <GemLadder />
      {results.length > 1 && (
        <div className="tabs" role="tablist">
          {results.map((r, i) => (
            <button key={i} role="tab" aria-selected={tab === i} className={`tab ${tab === i ? "on" : ""}`} onClick={() => setTab(i)}>
              L{levels[i].level} · {levels[i].title}
            </button>
          ))}
        </div>
      )}
      <p className="fine" style={{ margin: 0 }}>
        {levels[tab].prompt}
      </p>
      {loadAll && (
        <div className="tabs" role="tablist" aria-label="Which answers">
          <button role="tab" aria-selected={view === "rarest"} className={`tab ${view === "rarest" ? "on" : ""}`} onClick={() => setView("rarest")}>
            Rarest 20
          </button>
          <button role="tab" aria-selected={view === "all"} className={`tab ${view === "all" ? "on" : ""}`} onClick={() => setView("all")}>
            All answers
          </button>
        </div>
      )}
      {view === "all" && loadAll ? <AllAnswers attemptId={results[tab].attemptId} load={loadAll} /> : <LevelAnswers result={results[tab]} />}
      <p className="fine">Rarity scores are fixed for the day, so every digger is scored the same way.</p>
    </Sheet>
  );
}

export function ShareSheet({ number, result, beat, onClose }: { number: string; result: DigResult; beat: number | null; onClose: () => void }) {
  const text = shareText(number, result, beat);
  const [toast, setToast] = useState("");
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  useEffect(
    () => () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    },
    [imgUrl],
  );

  return (
    <Sheet title="Share your dig" onClose={onClose}>
      <div className="share-card px dark">
        <span className="label">DIGLY {number}</span>
        <span className="big-num">{result.total.toLocaleString()}</span>
        <span style={{ fontWeight: 700, fontSize: 18 }}>{subline(result, beat)}</span>
        {result.levels.map((l, i) => (
          <span key={i} style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
            <span className="label" style={{ width: 28 }}>L{l.level}</span>
            {l.top.map((t, j) => (
              <GemIcon key={j} tier={tierOf(t).key} size={3} />
            ))}
            <span className="label" style={{ marginLeft: 6 }}>{l.points.toLocaleString()}</span>
          </span>
        ))}
        <span style={{ fontSize: 14, color: "#8a7fa6" }}>Dig deep. {siteName()}</span>
      </div>
      <div className="share-actions">
        <button
          className="btn btn-go"
          onClick={async () => {
            sfx.button();
            try {
              await navigator.clipboard.writeText(text);
              setToast("Copied. Paste it anywhere.");
            } catch {
              setToast("Copy was blocked here. Select the text below instead.");
            }
          }}
        >
          Copy
        </button>
        {canShare && (
          <button
            className="btn"
            onClick={async () => {
              sfx.button();
              try {
                await navigator.share({ text });
              } catch {
                // cancelled
              }
            }}
          >
            Share…
          </button>
        )}
        <button
          className="btn btn-dark"
          onClick={async () => {
            sfx.button();
            const b = await shareImage(number, result, beat);
            if (!b) return setToast("Couldn't draw the image on this device.");
            const url = URL.createObjectURL(b);
            setImgUrl(url);
            const a = document.createElement("a");
            a.href = url;
            a.download = `digly-${number.replace("#", "")}.png`;
            a.click();
            setToast("Image saved. If nothing downloaded, long-press the preview below.");
          }}
        >
          Save image
        </button>
      </div>
      <div className="toast" role="status">
        {toast}
      </div>
      <pre className="share-text">{text}</pre>
      {imgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgUrl} alt={`Digly ${number} result card, ${result.total} points`} style={{ width: "100%", maxWidth: 320, alignSelf: "center", imageRendering: "pixelated" }} />
      )}
      <p className="fine">The card never shows your answers, so it won&apos;t spoil today&apos;s dig.</p>
    </Sheet>
  );
}

// Sign up or log in. Guests play freely; an account is what posts a score.
export function AccountSheet(props: {
  reason?: string;
  start?: "signup" | "login";
  onSignUp: (u: string, p: string, e: string, marketing: boolean) => Promise<unknown>;
  onLogIn: (u: string, p: string) => Promise<unknown>;
  onForgot: (login: string) => Promise<unknown>;
  onClose: () => void;
  google?: boolean; // offer Continue with Google
}) {
  const [mode, setMode] = useState<"signup" | "login" | "forgot">(props.start ?? "signup");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const field = { fontSize: 16, padding: "10px 12px", border: "3px solid #24160f", borderRadius: 6, fontFamily: "inherit", fontWeight: 700, width: "100%" } as const;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const u = String(f.get("username") ?? "");
    const p = String(f.get("password") ?? "");
    setBusy(true);
    setErr("");
    try {
      if (mode === "forgot") {
        await props.onForgot(u);
        setSent(true);
        return;
      }
      if (mode === "signup") await props.onSignUp(u, p, String(f.get("email") ?? ""), f.get("marketing") === "on");
      else await props.onLogIn(u, p);
      sfx.stamp();
      props.onClose();
    } catch (x) {
      setErr(x instanceof Error && x.message !== "offline" ? x.message : "Couldn't reach the mine. Try again.");
      sfx.invalid();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={mode === "signup" ? "Create an account" : mode === "login" ? "Log in" : "Reset your password"} onClose={props.onClose}>
      {props.reason && <p className="fine" style={{ margin: 0 }}>{props.reason}</p>}
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === "signup"} className={`tab ${mode === "signup" ? "on" : ""}`} onClick={() => (setMode("signup"), setErr(""))}>
          New account
        </button>
        <button role="tab" aria-selected={mode !== "signup"} className={`tab ${mode !== "signup" ? "on" : ""}`} onClick={() => (setMode("login"), setErr(""))}>
          I have one
        </button>
      </div>
      {mode === "forgot" ? (
        sent ? (
          <p role="status" style={{ margin: 0, fontWeight: 700 }}>
            If that account has an email on file, a reset link is on its way. It works for one hour. Check your spam folder too.
          </p>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="label">Username or email</span>
              <input name="username" required maxLength={200} autoComplete="username" autoCapitalize="off" spellCheck={false} style={field} />
            </label>
            {err && (
              <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 700 }}>
                {err}
              </p>
            )}
            <button className="btn btn-big btn-y" type="submit" disabled={busy}>
              {busy ? "…" : "Send reset link"}
            </button>
            <p className="fine" style={{ margin: 0 }}>
              Resets go to the email on your account. No email on file? A reset isn&apos;t possible, so add one in Options once you&apos;re back in.
            </p>
          </form>
        )
      ) : (
      <>
      {props.google && (
        <>
          <a className="btn btn-dark google-btn" href="/api/auth/google">
            Continue with Google
          </a>
          <p className="fine or-line" style={{ margin: 0 }}>or {mode === "signup" ? "make one with a password" : "use your password"}</p>
        </>
      )}
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }} autoComplete="on">
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="label">Username</span>
          <input name="username" required minLength={3} maxLength={16} pattern="[A-Za-z0-9_]+" autoComplete="username" autoCapitalize="off" spellCheck={false} style={field} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="label">Password</span>
          <input name="password" type="password" required minLength={8} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} style={field} />
        </label>
        {mode === "signup" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="label">Email (for password resets)</span>
            <input name="email" type="email" required maxLength={200} autoComplete="email" style={field} />
          </label>
        )}
        {mode === "signup" && <MarketingBox />}
        {err && (
          <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 700 }}>
            {err}
          </p>
        )}
        <button className="btn btn-big btn-y" type="submit" disabled={busy}>
          {busy ? "…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
        {mode === "login" && (
          <button type="button" className="linkish" onClick={() => (setMode("forgot"), setErr(""), setSent(false))}>
            Forgot password?
          </button>
        )}
        {mode === "signup" && (
          <p className="fine" style={{ margin: 0 }}>
            Today&apos;s dig from this device comes with you and goes on the board. By signing up you agree to the{" "}
            <a href="/terms" target="_blank">terms</a> and <a href="/privacy" target="_blank">privacy policy</a>.
          </p>
        )}
      </form>
      </>
      )}
    </Sheet>
  );
}

// Unchecked unless the player ticks it; only for news emails, never game emails.
function MarketingBox({ defaultOn = false }: { defaultOn?: boolean }) {
  return (
    <label className="check-row">
      <input type="checkbox" name="marketing" defaultChecked={defaultOn} />
      <span>Email me now and then about new features and Vault packs. Optional, and you can turn it off any time.</span>
    </label>
  );
}

// After Continue with Google, a new player picks a username (?google=pick).
export function GooglePickSheet(props: { onPick: (username: string, marketing: boolean) => Promise<unknown>; onClose: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const field = { fontSize: 16, padding: "10px 12px", border: "3px solid #24160f", borderRadius: 6, fontFamily: "inherit", fontWeight: 700, width: "100%" } as const;
  return (
    <Sheet title="Pick a username" onClose={props.onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setErr("");
          try {
            await props.onPick(String(f.get("username") ?? ""), f.get("marketing") === "on");
            sfx.stamp();
            props.onClose();
          } catch (x) {
            setErr(x instanceof Error && x.message !== "offline" ? x.message : "Couldn't reach the mine. Try again.");
            sfx.invalid();
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="fine" style={{ margin: 0 }}>Google is ready. This name shows on the board.</p>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="label">Username</span>
          <input name="username" required minLength={3} maxLength={16} pattern="[A-Za-z0-9_]+" autoComplete="username" autoCapitalize="off" spellCheck={false} style={field} />
        </label>
        <MarketingBox />
        {err && (
          <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 700 }}>
            {err}
          </p>
        )}
        <button className="btn btn-big btn-y" type="submit" disabled={busy}>
          {busy ? "…" : "Create account"}
        </button>
        <p className="fine" style={{ margin: 0 }}>
          Today&apos;s dig from this device comes with you. By signing up you agree to the <a href="/terms" target="_blank">terms</a> and{" "}
          <a href="/privacy" target="_blank">privacy policy</a>.
        </p>
      </form>
    </Sheet>
  );
}

// For older accounts made before email was required.
export function AddEmailSheet(props: { onSave: (email: string) => Promise<unknown>; onClose: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const field = { fontSize: 16, padding: "10px 12px", border: "3px solid #24160f", borderRadius: 6, fontFamily: "inherit", fontWeight: 700, width: "100%" } as const;
  return (
    <Sheet title="Add your email" onClose={props.onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await props.onSave(String(new FormData(e.currentTarget).get("email") ?? ""));
            sfx.stamp();
            props.onClose();
          } catch (x) {
            setErr(x instanceof Error && x.message !== "offline" ? x.message : "Couldn't reach the mine. Try again.");
            sfx.invalid();
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="fine" style={{ margin: 0 }}>Your account has no email yet. Without one, a forgotten password can&apos;t be reset.</p>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="label">Email</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" style={field} />
        </label>
        {err && (
          <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 700 }}>
            {err}
          </p>
        )}
        <button className="btn btn-big btn-y" type="submit" disabled={busy}>
          {busy ? "…" : "Save email"}
        </button>
        <button type="button" className="linkish" onClick={props.onClose}>
          Later
        </button>
      </form>
    </Sheet>
  );
}

// Opened from the link in a reset email (?reset=...).
export function ResetSheet(props: { onReset: (password: string) => Promise<unknown>; onClose: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const field = { fontSize: 16, padding: "10px 12px", border: "3px solid #24160f", borderRadius: 6, fontFamily: "inherit", fontWeight: 700, width: "100%" } as const;
  return (
    <Sheet title="Pick a new password" onClose={props.onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const a = String(f.get("password") ?? "");
          if (a !== String(f.get("again") ?? "")) return setErr("Those passwords don't match.");
          setBusy(true);
          setErr("");
          try {
            await props.onReset(a);
            sfx.stamp();
            props.onClose();
          } catch (x) {
            setErr(x instanceof Error && x.message !== "offline" ? x.message : "Couldn't reach the mine. Try again.");
            sfx.invalid();
          } finally {
            setBusy(false);
          }
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="label">New password</span>
          <input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" style={field} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="label">Same again</span>
          <input name="again" type="password" required minLength={8} maxLength={128} autoComplete="new-password" style={field} />
        </label>
        {err && (
          <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 700 }}>
            {err}
          </p>
        )}
        <button className="btn btn-big btn-y" type="submit" disabled={busy}>
          {busy ? "…" : "Save and log in"}
        </button>
        <p className="fine" style={{ margin: 0 }}>This logs you out everywhere else.</p>
      </form>
    </Sheet>
  );
}

// A prompt idea from the player. Works for guests too.
export function SuggestSheet({ onSend, onClose }: { onSend: (text: string) => Promise<void>; onClose: () => void }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 2 || state === "sending") return;
    setState("sending");
    try {
      await onSend(text.trim());
      setState("sent");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't send that.");
      setState("error");
    }
  };
  return (
    <Sheet title="Suggest a prompt" onClose={onClose}>
      {state === "sent" ? (
        <p className="note">Thanks! Your idea is in the pile.</p>
      ) : (
        <form className="suggest" onSubmit={send}>
          <label htmlFor="suggest-in">Got an idea for a category? Keep it to a few words.</label>
          <div className="suggest-row">
            <input
              id="suggest-in"
              value={text}
              maxLength={120}
              placeholder="e.g. Board games from the 80s"
              autoComplete="off"
              enterKeyHint="send"
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn btn-sm btn-y" disabled={text.trim().length < 2 || state === "sending"}>
              {state === "sending" ? "…" : "Send"}
            </button>
          </div>
          {state === "error" && (
            <div role="alert" className="suggest-err">
              {err}
            </div>
          )}
        </form>
      )}
    </Sheet>
  );
}
