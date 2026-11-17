"use client";

import { useState } from "react";
import { digSlots } from "@/game/service/slots";
import type { Progress } from "@/game/progress";
import { dayStart } from "@/game/rules/schedule";
import { FREE_VAULT_DAYS, UNLIMITED, vaultOpen } from "@/game/rules/plans";
import { sfx } from "@/audio/sfx";
import { ScreenFrame } from "./ScreenFrame";

export function VaultScreen(props: {
  today: number;
  progress: Progress;
  unlimited: boolean;
  onBack: () => void;
  onPlay: (day: number) => void;
  onUnlock: () => Promise<void>;
}) {
  const days = Array.from({ length: Math.max(0, props.today - 1) }, (_, i) => props.today - 1 - i);
  const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const locked = days.filter((d) => !vaultOpen(d, props.today, props.unlimited)).length;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const unlock = async () => {
    sfx.button();
    setBusy(true);
    setErr("");
    try {
      await props.onUnlock();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't open checkout.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenFrame title="The Vault" onBack={props.onBack}>
      <p className="note">Every past dig, sealed behind its own door. Categories stay hidden until you dig them. Replays are unranked.</p>
      {props.unlimited ? (
        <p className="note unlimited-badge">Digly Unlimited: every door is open.</p>
      ) : (
        <div className="unlock-card px dark">
          <div>
            <div className="t">{UNLIMITED.name}</div>
            <div className="d">
              Open every past dig and replay any of them as often as you like. One payment of {UNLIMITED.label}, yours for good.
              {locked > 0 ? ` ${locked} sealed dig${locked === 1 ? "" : "s"} waiting.` : ""}
            </div>
          </div>
          <button className="btn btn-y" onClick={unlock} disabled={busy}>
            {busy ? "…" : `Unlock for ${UNLIMITED.label}`}
          </button>
          {err && (
            <div role="alert" style={{ fontSize: 14, fontWeight: 700, color: "#ffb4a8" }}>
              {err}
            </div>
          )}
          <div className="fine" style={{ color: "#cdb68b", margin: 0 }}>
            Free: today&apos;s dig plus the last {FREE_VAULT_DAYS} days. Paid securely through Stripe.
          </div>
        </div>
      )}
      {days.length === 0 && <p className="note">No past digs yet. Come back tomorrow.</p>}
      <div className="vault-grid">
        {days.map((d) => {
          const dig = digSlots(d);
          const rec = props.progress.ranked[d];
          const best = Math.max(rec?.score ?? 0, props.progress.practiceBest[d] ?? 0);
          const open = vaultOpen(d, props.today, props.unlimited);
          // categories you've dug are remembered on this device; the rest stay sealed
          const titles = rec?.result?.levels.map((l) => l.challenge?.title) ?? props.progress.practiceTitles?.[d] ?? [];
          return (
            <button
              key={d}
              className={`room px dark ${open ? "" : "locked"}`}
              onClick={() => {
                if (!open) return void unlock();
                sfx.button();
                props.onPlay(d);
              }}
              aria-label={`${dig.number}, ${titles.length ? titles.join(", ") : "categories hidden until you dig"}, ${fmt.format(dayStart(d))}. ${rec ? `Ranked score ${rec.score}.` : "Not played on the day."} ${best ? `Best ${best}.` : ""} ${open ? "Practice." : "Needs Digly Unlimited."}`}
            >
              <span className="num">{dig.number}</span>
              <span className="cat">
                {dig.levels.map((l) => (
                  <span key={l.level} style={{ display: "block" }}>
                    {l.level}. {titles[l.level - 1] ?? "? ? ?"}
                  </span>
                ))}
              </span>
              <span className="date">{fmt.format(dayStart(d))}</span>
              <span className="status">
                <span>{rec ? `Dug · ${rec.score}` : best ? `Best ${best}` : "Sealed"}</span>
                <span className="go">{open ? "Dig" : "🔒"}</span>
              </span>
            </button>
          );
        })}
      </div>
    </ScreenFrame>
  );
}
