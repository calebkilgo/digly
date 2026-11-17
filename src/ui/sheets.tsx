"use client";

import { useEffect, useRef, useState } from "react";
import type { AttemptResult, DigResult, PublicChallenge, RevealedAnswer } from "@/game/service/types";
import { foundByPct, tierFor } from "@/game/rules/scoring";
import { sfx } from "@/audio/sfx";
import { GemIcon } from "./art";
import { GemLadder } from "./GemLadder";
import { shareImage, shareText } from "./share";

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
  const t = tierFor(a.rarity);
  return (
    <li className={cls}>
      <GemIcon tier={t.key} size={2} />
      <span>
        {a.name}
        <br />
        <span className="p">{a.pct ?? `~${foundByPct(a.rarity)}`}% found it</span>
      </span>
      <span className="r">{a.rarity}</span>
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

// The rarest answers, one tab per level.
export function AnswersSheet({ levels, results, start = 0, onClose }: { levels: PublicChallenge[]; results: AttemptResult[]; start?: number; onClose: () => void }) {
  const [tab, setTab] = useState(Math.min(start, results.length - 1));
  return (
    <Sheet title="Rarest answers" onClose={onClose}>
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
      <LevelAnswers result={results[tab]} />
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
        <span style={{ fontWeight: 700, fontSize: 18 }}>{beat !== null ? `Rarer than ${beat}% of diggers` : "Dig deep."}</span>
        {result.levels.map((l, i) => (
          <span key={i} style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
            <span className="label" style={{ width: 28 }}>L{l.level}</span>
            {l.top.map((t, j) => (
              <GemIcon key={j} tier={tierFor(t.rarity).key} size={3} />
            ))}
          </span>
        ))}
        <span style={{ fontSize: 14, color: "#8a7fa6" }}>Dig deep. digly.io</span>
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
  onSignUp: (u: string, p: string, e?: string) => Promise<unknown>;
  onLogIn: (u: string, p: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"signup" | "login">(props.start ?? "signup");
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
      if (mode === "signup") await props.onSignUp(u, p, String(f.get("email") ?? "") || undefined);
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
    <Sheet title={mode === "signup" ? "Create an account" : "Log in"} onClose={props.onClose}>
      {props.reason && <p className="fine" style={{ margin: 0 }}>{props.reason}</p>}
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === "signup"} className={`tab ${mode === "signup" ? "on" : ""}`} onClick={() => (setMode("signup"), setErr(""))}>
          New account
        </button>
        <button role="tab" aria-selected={mode === "login"} className={`tab ${mode === "login" ? "on" : ""}`} onClick={() => (setMode("login"), setErr(""))}>
          I have one
        </button>
      </div>
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
            <span className="label">Email (optional, for account recovery)</span>
            <input name="email" type="email" maxLength={200} autoComplete="email" style={field} />
          </label>
        )}
        {err && (
          <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 700 }}>
            {err}
          </p>
        )}
        <button className="btn btn-big btn-y" type="submit" disabled={busy}>
          {busy ? "…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
        {mode === "signup" && <p className="fine" style={{ margin: 0 }}>Today&apos;s dig from this device comes with you and goes on the board.</p>}
      </form>
    </Sheet>
  );
}
