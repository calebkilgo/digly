"use client";

import { useEffect, useState } from "react";
import type { CategoryInfo } from "@/game/service/types";
import { sfx } from "@/audio/sfx";
import type { MotionPref, Settings } from "../settings";
import { ScreenFrame } from "./ScreenFrame";

export function SettingsScreen(props: {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  systemRm: boolean;
  onBack: () => void;
  onResetToday: () => Promise<void>;
  onResetAll: () => Promise<void>;
  admin: boolean;
  unlimited: boolean;
  onUnlimited: () => void;
  loadCategories: () => Promise<CategoryInfo[]>;
  onDemo: (slugs: string[]) => void;
  email: string | null;
  onEmail: (email: string) => Promise<void>;
  onDelete: (password: string) => Promise<void>;
  username: string | null;
  onAccount: (start: "signup" | "login") => void;
  onLogOut: () => Promise<void>;
}) {
  const { settings, update } = props;
  const [msg, setMsg] = useState("");
  const [acctMsg, setAcctMsg] = useState("");

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
              <b>Digly Unlimited: every past dig is open.</b>
            ) : (
              <button type="button" className="linkish" onClick={props.onUnlimited}>
                Get Digly Unlimited ($5, one time)
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
                () => setAcctMsg(v ? "Email saved." : "Email removed."),
                (x) => setAcctMsg(x instanceof Error ? x.message : "Couldn't save that."),
              );
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
              <span className="d">{props.email ? "Email for password resets" : "Add an email so you can reset your password"}</span>
              <input
                name="email"
                type="email"
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
            <span role="status" style={{ fontSize: 13, flexBasis: "100%", minHeight: 16 }}>
              {acctMsg}
            </span>
          </form>
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
                  const pw = window.prompt(`Delete ${props.username} for good? Your scores and history are removed and can't be brought back. Type your password to confirm.`);
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
            Only you see this. Resets remove your own runs and keep you logged in.
          </div>
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
      </div>
      )}
    </ScreenFrame>
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
