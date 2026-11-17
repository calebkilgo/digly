"use client";

import { useEffect, useRef, useState } from "react";
import type { DiglyScene, RockAnchor } from "@/scene/DiglyScene";
import type { AttemptResult, RevealedAnswer } from "@/game/service/types";
import { foundLabel, tierFor } from "@/game/rules/scoring";
import { LEVELS } from "@/game/rules/levels";
import { hash } from "@/scene/rng";
import { sfx } from "@/audio/sfx";
import { useSceneInsets } from "../SceneHost";
import { GEM_FILL } from "../art";
import { AnswersSheet } from "../sheets";
import type { Run } from "../GameShell";

// Rocks read left to right from least to most rare, so the biggest crack
// always comes last. Empty slots (too few finds) go first.
function revealOrder(top: RevealedAnswer[], n: number): (RevealedAnswer | null)[] {
  const slots: (RevealedAnswer | null)[] = [];
  for (let i = n - 1; i >= 0; i--) slots.push(top[i] ?? null);
  return slots;
}

// The end of one level: three rocks crack, the level's points count up with
// its multiplier, then the player digs deeper or goes to the results.
export function RevealScreen(props: {
  scene: DiglyScene | null;
  run: Run;
  result: AttemptResult;
  reduced: boolean;
  say: (m: string) => void;
  onNext: () => void;
  onSummary: () => void;
}) {
  const { scene, run, result, say } = props;
  const ch = result.challenge;
  const last = run.level === 2;
  const topRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useSceneInsets(scene, topRef, dockRef);

  const slots = revealOrder(result.top, ch.scored);
  const totalSoFar = run.results.slice(0, run.level + 1).reduce((s, r) => s + r.points, 0);
  const [anchors, setAnchors] = useState<RockAnchor[]>([]);
  const [shown, setShown] = useState<boolean[]>(() => slots.map(() => false));
  const [plat, setPlat] = useState(false);
  const [shownScore, setShownScore] = useState<number | null>(null);
  const [multiplied, setMultiplied] = useState(false);
  const [done, setDone] = useState(false);
  const [sheet, setSheet] = useState(false);
  const started = useRef(false);
  const countRaf = useRef(0);
  const finished = useRef(false);
  const completeRef = useRef<() => void>(() => {});

  useEffect(() => (scene ? scene.onAnchors(setAnchors) : undefined), [scene]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const complete = () => {
      if (finished.current) return;
      finished.current = true;
      setShownScore(result.points);
      setMultiplied(true);
      setDone(true);
      sfx.final(result.score);
      scene?.celebrate(result.top.some((t) => t.rarity >= 75));
      say(`Level ${ch.level}: ${result.score} times ${ch.multiplier}, ${result.points} points.`);
    };
    completeRef.current = complete;

    // count the base score, then stamp the multiplier on top
    const countUp = () => {
      const dur = props.reduced ? 1 : 700;
      const t0 = performance.now();
      let lastTick = 0;
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        setShownScore(Math.round(result.score * (1 - Math.pow(1 - p, 3))));
        if (now - lastTick > 55 && p < 1) {
          lastTick = now;
          sfx.countTick();
        }
        if (p < 1) countRaf.current = requestAnimationFrame(step);
        else if (ch.multiplier > 1) {
          setTimeout(() => {
            sfx.stamp();
            complete();
          }, 300);
        } else complete();
      };
      countRaf.current = requestAnimationFrame(step);
    };

    const onGem = (i: number) => {
      setShown((s) => s.map((v, j) => (j === i ? true : v)));
      const a = slots[i];
      sfx.crack();
      const tk = a ? tierFor(a.rarity).key : null;
      sfx.gem(tk);
      if (tk === "platinum") {
        setPlat(true);
        setTimeout(() => sfx.fanfare(), 250);
        setTimeout(() => setPlat(false), 1700);
      }
      say(a ? `${a.name}: ${a.rarity}, ${tierFor(a.rarity).label}.` : "Empty rock.");
    };

    if (scene) {
      scene.startReveal(
        slots.map((a) => ({ tier: a ? tierFor(a.rarity).key : null })),
        hash(result.score, result.accepted.length, run.dig.day, ch.level),
        { onLand: () => sfx.thud(), onCrackStart: () => sfx.crackle(), onGem, onDone: countUp },
      );
    } else {
      slots.forEach((_, i) => setTimeout(() => onGem(i), 500 + i * 700));
      setTimeout(countUp, 700 + slots.length * 700);
    }
    return () => cancelAnimationFrame(countRaf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    scene?.skipReveal();
    setShown(slots.map(() => true));
    setTimeout(() => {
      cancelAnimationFrame(countRaf.current);
      completeRef.current();
    }, 40);
  };

  return (
    <div className="layer">
      <div className="reveal-top" ref={topRef}>
        <div className="scorebox">
          <span className="label lv-label">
            Level {ch.level} · {ch.levelName} · {ch.title}
          </span>
          <div>
            <span className="big-num score">{shownScore ?? "?"}</span>
            {ch.multiplier > 1 && shownScore !== null && (
              <span className={`mult ${multiplied ? "on" : ""}`}>{multiplied ? `${result.score} x${ch.multiplier}` : `x${ch.multiplier}`}</span>
            )}
          </div>
          {done && run.level > 0 && <span className="running">Dig total {totalSoFar.toLocaleString()}</span>}
        </div>
        {!done && (
          <button className="btn btn-dark btn-sm" onClick={skip}>
            Skip
          </button>
        )}
      </div>

      {slots.map((a, i) => {
        const an = anchors[i];
        if (!shown[i]) return null;
        const spacing = anchors.length > 1 ? Math.abs(anchors[1].x - anchors[0].x) : 160;
        const pos = an
          ? { left: an.x, top: an.y + an.size * 0.5, width: Math.min(124, spacing - 4) }
          : { left: `${((i + 1) * 100) / (slots.length + 1)}%`, top: "55%" };
        if (!a)
          return (
            <div className="rock-label" style={pos} key={i}>
              <div className="big-num pts" style={{ color: "#c8ccd8" }}>
                0
              </div>
              <div className="name px">No find</div>
            </div>
          );
        const t = tierFor(a.rarity);
        return (
          <div className={`rock-label ${t.key === "platinum" ? "platinum" : ""}`} style={pos} key={i}>
            <div className="big-num pts" style={{ color: GEM_FILL[t.key].base }}>
              {a.rarity}
            </div>
            <div className="name px">{a.name}</div>
            <div>
              <span className="tier" style={{ background: GEM_FILL[t.key].base }}>
                {t.label}
              </span>
            </div>
            {spacing >= 100 && <span className="pct">{foundLabel(a)}</span>}
          </div>
        );
      })}

      {plat && (
        <div className="plat-banner" aria-hidden>
          <div className="big-num">PLATINUM!</div>
        </div>
      )}

      <div className="spacer" />

      <div className="results-dock px dark lv-dock" ref={dockRef} style={{ visibility: done ? "visible" : "hidden" }}>
        <div className="sub">
          <span>
            {result.accepted.length} find{result.accepted.length === 1 ? "" : "s"} · top {ch.scored} counted
          </span>
          <span className="label" style={{ color: "#8a7fa6" }}>
            {last ? "Last level" : `Next: level ${ch.level + 1} · ${LEVELS[ch.level].seconds}s · x${LEVELS[ch.level].mult}`}
          </span>
        </div>
        {last ? (
          <button className="btn btn-y btn-big wide" onClick={() => (sfx.button(), props.onSummary())} disabled={!done}>
            See results
          </button>
        ) : (
          <button className="btn btn-y btn-big wide" onClick={() => (sfx.button(), props.onNext())} disabled={!done}>
            Dig deeper
          </button>
        )}
        <button className="btn wide" onClick={() => (sfx.button(), setSheet(true))} disabled={!done}>
          Rarest answers for this level
        </button>
      </div>

      {sheet && <AnswersSheet levels={[ch]} results={[result]} onClose={() => setSheet(false)} />}
    </div>
  );
}
