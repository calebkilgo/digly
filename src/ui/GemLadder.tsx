import { TIERS } from "@/game/rules/scoring";
import { GemIcon } from "./art";

// The rarity ladder, rarest last so it reads like a climb.
export function GemLadder({ dark = false }: { dark?: boolean }) {
  const rungs = [...TIERS].reverse();
  return (
    <div className={`ladder ${dark ? "on-dark" : ""}`} role="list" aria-label="Gem ranks from common to rarest">
      {rungs.map((t) => (
        <div className="rung" role="listitem" key={t.key}>
          <GemIcon tier={t.key} size={3} />
          <b>{t.label}</b>
          <span className="how">{t.blurb}</span>
        </div>
      ))}
    </div>
  );
}
