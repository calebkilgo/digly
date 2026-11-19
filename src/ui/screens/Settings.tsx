"use client";

import { useEffect, useState } from "react";
import type { Account, CategoryInfo } from "@/game/service/types";
import { sfx } from "@/audio/sfx";
import type { MotionPref, Settings } from "../settings";
import { ScreenFrame } from "./ScreenFrame";
import { analyticsConfigured, analyticsOn, choose, privacySignal } from "@/lib/consent";

export function SettingsScreen(props: {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  systemRm: boolean;
  onBack: () => void;
  onResetToday: () => Promise<void>;
  onResetAll: () => Promise<void>;
  admin: boolean;
  loadSuggestions: () => Promise<{ text: string; day: number; createdAt: number }[]>;
  unlimited: boolean;
  onUnlimited: () => void;
  loadCategories: () => Promise<CategoryInfo[]>;
  onDemo: (slugs: string[]) => void;
  email: string | null;
  onEmail: (email: string) => Promise<void>;
  onDelete: (password: string) => Promise<void>;
  account: Account | null; // verified email, Google, marketing
  onResend: () => Promise<void>;
  onMarketing: (on: boolean) => Promise<void>;
  username: string | null;
  onAccount: (start: "signup" | "login") => void;
  onLogOut: () => Promise<void>;
}) {
  const { settings, update } = props;
  const [msg, setMsg] = useState("");
  const [acctMsg, setAcctMsg] = useState("");
  const [mkt, setMkt] = useState<boolean | null>(null); // shows the tick before the server answers
  const [stats, setStats] = useState<{ on: boolean; locked: boolean } | null>(null);
  useEffect(() => {
    if (!analyticsConfigured()) return;
    const locked = privacySignal();
    setStats({ on: analyticsOn(), locked });
  }, []);

  const lever = (label: string, desc: string, on: boolean, set: (v: boolean) => void) => (
    <div className="setting px">
      <div>
        <div className="t" id={`l-${label}`}>
          {label}
        </div>
        <div className="d">{desc}</div>
      </div>
      <button
        className="lever"
        role="switch"
        aria-checked={on}
        aria-labelledby={`l-${label}`}
        onClick={() => {
          set(!on);
          sfx.button();
        }}
      />
    </div>
  );

  const motions: [MotionPref, string][] = [
    ["system", "System"],
    ["reduced", "Reduced"],
    ["full", "Full"],
  ];

  return (
    <ScreenFrame title="Settings" onBack={props.onBack}>
      {lever("Sound", "Pickaxe, chimes, cracks and fanfares.", settings.sound, (v) => update({ sound: v }))}
      {lever("Music", "A little chiptune loop. Speeds up as you dig deeper.", settings.music, (v) => update({ music: v }))}
      <div className="setting px">
        <div>
          <div className="t">Motion</div>
          <div className="d">Reduced removes shake and cuts particles. System is {props.systemRm ? "reduced" : "full"} on this device.</div>
        </div>
        <div className="seg" role="group" aria-label="Motion">
          {motions.map(([k, l]) => (
            <button key={k} aria-pressed={settings.motion === k} onClick={() => (update({ motion: k }), sfx.button())}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {lever("High contrast", "Stronger contrast on panels and text.", settings.highContrast, (v) => update({ highContrast: v }))}
      {stats &&
        (stats.locked ? (
          <div className="setting px">
            <div>
              <div className="t">Usage stats</div>
              <div className="d">Off, because your browser asks sites not to track it (Global Privacy Control or Do Not Track).</div>
            </div>
          </div>
        ) : (
          lever("Usage stats", "Lets Digly count screens opened and levels finished, to make the game better. No ads, nothing sold.", stats.on, (v) => {
            choose(v ? "yes" : "no");
            setStats({ on: v, locked: false });
          })
        ))}
      <div className="setting px" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div>
          <div className="t">Account</div>
          <div className="d">
            {props.username
              ? `Logged in as ${props.username}. Your ranked digs go on the board.`
              : "Playing as a guest. Make an account to put your scores on the board."}
          </div>
          <div className="d" style={{ marginTop: 6 }}>
            {props.unlimited ? (
              <>
                <b>Digly Unlimited: every past dig is open.</b>
                <br />
                It belongs to this account only and can&apos;t be refunded or moved to another account.
              </>
            ) : (
              <button type="button" className="linkish" onClick={props.onUnlimited}>
                Get Digly Unlimited ($5, one time, non-refundable)
              </button>
            )}
          </div>
        </div>
        {props.username && (
          <form
            style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}
            onSubmit={(e) => {
              e.preventDefault();
              const v = String(new FormData(e.currentTarget).get("email") ?? "");
              void props.onEmail(v).then(
                () => setAcctMsg(v === props.email ? "That's already your email." : `Saved. Check ${v} for a link to confirm it.`),
                (x) => setAcctMsg(x instanceof Error ? x.message : "Couldn't save that."),
              );
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
              <span className="d">
                {props.email ? "Email for password resets" : "Add an email so you can reset your password"}
                {props.email && props.account?.username && (props.account.emailVerified ? " · confirmed" : " · not confirmed yet")}
              </span>
              <input
                name="email"
                type="email"
                required
                defaultValue={props.email ?? ""}
                key={props.email ?? ""}
                maxLength={200}
                autoComplete="email"
                style={{ fontSize: 16, padding: "8px 10px", border: "3px solid #24160f", borderRadius: 6, fontFamily: "inherit", fontWeight: 700 }}
              />
            </label>
            <button className="btn btn-sm" type="submit">
              Save
            </button>
            {props.email && props.account?.username && !props.account.emailVerified && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  void props.onResend().then(
                    () => setAcctMsg(`Sent. Check ${props.email} and your spam folder.`),
                    (x) => setAcctMsg(x instanceof Error ? x.message : "Couldn't send that."),
                  )
                }
              >
                Resend link
              </button>
            )}
            <span role="status" style={{ fontSize: 13, flexBasis: "100%", minHeight: 16 }}>
              {acctMsg}
            </span>
          </form>
        )}
        {props.username && props.account?.username && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={mkt ?? !!props.account.marketing}
              onChange={(e) => {
                const on = e.target.checked;
                setMkt(on);
                void props.onMarketing(on).then(
                  () => (setMkt(null), setAcctMsg(on ? "You'll get the occasional Digly news email." : "No more news emails.")),
                  (x) => (setMkt(null), setAcctMsg(x instanceof Error ? x.message : "Couldn't save that.")),
                );
              }}
            />
            <span>Email me now and then about new features and Vault packs.</span>
          </label>
        )}
        {props.username && props.account?.googleEnabled && (
          <div className="d">
            {props.account.google ? (
              "Google sign-in is connected."
            ) : (
              <a className="linkish" href="/api/auth/google?intent=link">
                Connect Google so you can sign in with it
              </a>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {props.username ? (
            <>
              <button className="btn btn-sm" onClick={() => void props.onLogOut()}>
                Log out
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  // an account made with Google has no password to type
                  const noPw = props.account?.hasPassword === false;
                  const pw = window.prompt(
                    `Delete ${props.username} for good? Your scores and history are removed and can't be brought back.${props.unlimited ? " Digly Unlimited is removed too. It isn't refunded and can't move to another account." : ""} ${noPw ? "Type your username to confirm." : "Type your password to confirm."}`,
                  );
                  if (!pw) return;
                  void props.onDelete(pw).then(
                    () => setAcctMsg("Account deleted."),
                    (x) => setAcctMsg(x instanceof Error ? x.message : "Couldn't delete the account."),
                  );
                }}
              >
                Delete account
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-sm btn-y" onClick={() => props.onAccount("signup")}>
                Create account
              </button>
              <button className="btn btn-sm" onClick={() => props.onAccount("login")}>
                Log in
              </button>
            </>
          )}
        </div>
      </div>
      <p className="fine" style={{ textAlign: "center" }}>
        <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of use</a>
      </p>
      {props.admin && (
      <div className="setting px dark" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div>
          <div className="t">Admin tools</div>
          <div className="d" style={{ color: "#cdb68b" }}>
            Only admins see this. Resets remove your own runs and keep you logged in.
          </div>
          <a className="btn btn-sm btn-y" href="/admin" style={{ marginTop: 8, display: "inline-block", textDecoration: "none" }}>
            Open the admin panel
          </a>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-sm"
            onClick={() => {
              void props.onResetToday().then(
                () => setMsg("Today's ranked dig is open again."),
                () => setMsg("Couldn't reach the server."),
              );
            }}
          >
            Reset today&apos;s dig
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              void props.onResetAll().then(
                () => setMsg("All progress cleared."),
                () => setMsg("Couldn't reach the server."),
              );
            }}
          >
            Clear all progress
          </button>
        </div>
        <div role="status" style={{ fontSize: 13, minHeight: 16 }}>
          {msg}
        </div>
        <DemoPicker load={props.loadCategories} onPlay={props.onDemo} />
        <Suggestions load={props.loadSuggestions} />
      </div>
      )}
    </ScreenFrame>
  );
}

// Admin: the latest prompt ideas players sent in.
function Suggestions({ load }: { load: () => Promise<{ text: string; day: number; createdAt: number }[]> }) {
  const [list, setList] = useState<{ text: string; createdAt: number }[] | null>(null);
  const [err, setErr] = useState("");
  if (!list)
    return (
      <div>
        <button className="btn btn-sm" onClick={() => load().then(setList, () => setErr("Couldn't load prompt ideas."))}>
          Show prompt ideas
        </button>
        {err && <div style={{ fontSize: 13 }}>{err}</div>}
      </div>
    );
  const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  return (
    <div style={{ fontSize: 13 }}>
      <div className="t" style={{ fontSize: 15 }}>Prompt ideas ({list.length})</div>
      {list.length === 0 ? (
        <div>None yet.</div>
      ) : (
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, maxHeight: 220, overflowY: "auto" }}>
          {list.map((s, i) => (
            <li key={i}>
              {s.text} <span style={{ color: "#cdb68b" }}>· {fmt.format(s.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Admin demo dig: pick a category for each level and play it unranked.
function DemoPicker({ load, onPlay }: { load: () => Promise<CategoryInfo[]>; onPlay: (slugs: string[]) => void }) {
  const [cats, setCats] = useState<CategoryInfo[] | null>(null);
  const [pick, setPick] = useState<string[]>(["", "", ""]);
  const [err, setErr] = useState("");
  // load once when the box opens (the prop is a fresh function each render)
  useEffect(() => {
    load().then(setCats, () => setErr("Couldn't load categories."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (err) return <div style={{ fontSize: 13 }}>{err}</div>;
  if (!cats) return null;
  const byLevel = [1, 2, 3].map((l) => cats.filter((c) => c.level === l).sort((a, b) => a.title.localeCompare(b.title)));
  const sel = { fontSize: 15, padding: "6px 8px", border: "3px solid #24160f", borderRadius: 6, fontFamily: "inherit", fontWeight: 700, minWidth: 0, flex: "1 1 160px" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "2px solid #5a4470", paddingTop: 10 }}>
      <div className="t" style={{ fontSize: 16 }}>Demo dig</div>
      <div className="d" style={{ color: "#cdb68b" }}>Pick a category for each level (or leave it random). Plays unranked and isn&apos;t saved.</div>
      {byLevel.map((list, i) => (
        <label key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="label" style={{ width: 28 }}>L{i + 1}</span>
          <select style={sel} value={pick[i]} onChange={(e) => setPick((p) => p.map((v, j) => (j === i ? e.target.value : v)))}>
            <option value="">Random ({list.length})</option>
            {list.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        className="btn btn-sm btn-y"
        onClick={() => onPlay(pick.map((p, i) => p || byLevel[i][Math.floor(Math.random() * byLevel[i].length)].slug))}
      >
        Play demo dig
      </button>
    </div>
  );
}
