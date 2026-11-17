"use client";

import { useState } from "react";
import type { Progress } from "@/game/progress";
import { VAULT_GAME_COUNT } from "@/game/data/vaultMeta.generated";
import { FREE_VAULT_GAMES, UNLIMITED, vaultGameOpen } from "@/game/rules/plans";
import { sfx } from "@/audio/sfx";
import { ScreenFrame } from "./ScreenFrame";

export function VaultScreen(props: {
  progress: Progress;
  unlimited: boolean;
  onBack: () => void;
  onPlay: (game: number) => void;
  onUnlock: () => Promise<void>;
}) {
  const games = Array.from({ length: VAULT_GAME_COUNT }, (_, i) => i + 1);
  const locked = games.filter((g) => !vaultGameOpen(g, props.unlimited)).length;
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
      <p className="note">Bonus digs, three levels each. Prompts stay hidden until you dig them. Unranked, so replay as often as you like.</p>
      {props.unlimited ? (
        <p className="note unlimited-badge">Digly Unlimited: every door is open.</p>
      ) : (
        <div className="unlock-card px dark">
          <div>
            <div className="t">{UNLIMITED.name}</div>
            <div className="d">
              Open every Vault game and replay any of them as often as you like. One payment of {UNLIMITED.label}, yours for good.
              {locked > 0 ? ` ${locked} sealed game${locked === 1 ? "" : "s"} waiting.` : ""}
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
            Free: games 1 to {FREE_VAULT_GAMES}. Paid securely through Stripe.
          </div>
        </div>
      )}
      <div className="vault-grid">
        {games.map((g) => {
          const best = props.progress.vaultBest?.[g] ?? 0;
          const open = vaultGameOpen(g, props.unlimited);
          // prompts you've dug are remembered on this device; the rest stay sealed
          const titles = props.progress.vaultTitles?.[g] ?? [];
          return (
            <button
              key={g}
              className={`room px dark ${open ? "" : "locked"}`}
              onClick={() => {
                if (!open) return void unlock();
                sfx.button();
                props.onPlay(g);
              }}
              aria-label={`Vault game ${g}, ${titles.length ? titles.join(", ") : "prompts hidden until you dig"}. ${best ? `Best ${best}.` : ""} ${open ? "Dig." : "Needs Digly Unlimited."}`}
            >
              <span className="num">#{g}</span>
              <span className="cat">
                {[1, 2, 3].map((l) => (
                  <span key={l} style={{ display: "block" }}>
                    {l}. {titles[l - 1] ?? "? ? ?"}
                  </span>
                ))}
              </span>
              <span className="date">Vault game</span>
              <span className="status">
                <span>{best ? `Best ${best}` : "Sealed"}</span>
                <span className="go">{open ? "Dig" : "🔒"}</span>
              </span>
            </button>
          );
        })}
      </div>
    </ScreenFrame>
  );
}
