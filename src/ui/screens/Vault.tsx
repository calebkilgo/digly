"use client";

import { digSlots } from "@/game/service/slots";
import type { Progress } from "@/game/progress";
import { dayStart } from "@/game/rules/schedule";
import { sfx } from "@/audio/sfx";
import { ScreenFrame } from "./ScreenFrame";

export function VaultScreen(props: {
  today: number;
  progress: Progress;
  onBack: () => void;
  onPlay: (day: number) => void;
}) {
  const days = Array.from({ length: Math.max(0, props.today - 1) }, (_, i) => props.today - 1 - i);
  const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <ScreenFrame title="The Vault" onBack={props.onBack}>
      <p className="note">
        Every past dig, sealed behind its own door. Categories stay hidden until you dig them. Practice runs are unranked. In the full game the Vault is a one-time unlock; this prototype opens it for testing, with
        payments coming in Phase 4.
      </p>
      {days.length === 0 && <p className="note">No past digs yet. Come back tomorrow.</p>}
      <div className="vault-grid">
        {days.map((d) => {
          const dig = digSlots(d);
          const rec = props.progress.ranked[d];
          const best = Math.max(rec?.score ?? 0, props.progress.practiceBest[d] ?? 0);
          // categories you've dug are remembered on this device; the rest stay sealed
          const titles = rec?.result?.levels.map((l) => l.challenge?.title) ?? props.progress.practiceTitles?.[d] ?? [];
          return (
            <button
              key={d}
              className="room px dark"
              onClick={() => {
                sfx.button();
                props.onPlay(d);
              }}
              aria-label={`${dig.number}, ${titles.length ? titles.join(", ") : "categories hidden until you dig"}, ${fmt.format(dayStart(d))}. ${rec ? `Ranked score ${rec.score}.` : "Not played on the day."} ${best ? `Best ${best}.` : ""} Practice.`}
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
                <span className="go">Dig</span>
              </span>
            </button>
          );
        })}
      </div>
    </ScreenFrame>
  );
}
