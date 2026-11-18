"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DiglyScene } from "@/scene/DiglyScene";
import type { DigResult } from "@/game/service/types";
import { SCORING, percentile, tierOf } from "@/game/rules/scoring";
import type { ChallengeService } from "@/game/service/types";
import { sfx } from "@/audio/sfx";
import { track } from "@/lib/track";
import { useSceneInsets } from "../SceneHost";
import { GemIcon } from "../art";
import { AnswersSheet, ShareSheet } from "../sheets";
import type { Run } from "../GameShell";

export interface Rewards {
  newBest: boolean;
  first: boolean;
  streak: number;
}

// The payoff for the whole dig: total, comparison, level-by-level breakdown.
export function SummaryScreen(props: {
  scene: DiglyScene | null;
  run: Run;
  result: DigResult;
  rewards: Rewards | null;
  service: ChallengeService | null;
  username: string | null;
  onPost: () => void;
  reduced: boolean;
  say: (m: string) => void;
  onHome: () => void;
  onBoard: () => void;
  onVault: () => void;
}) {
  const { scene, run, result, rewards, say } = props;
  const topRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useSceneInsets(scene, topRef, dockRef);
  // compared against the real board; hidden until enough other diggers have finished
  const [beat, setBeat] = useState<number | null>(null);
  useEffect(() => {
    if (!props.service || result.mode !== "ranked") return;
    let live = true;
    props.service
      .board(result.day)
      .then((b) => {
        const others = b.entries.filter((e) => !e.isYou).map((e) => e.score);
        if (live && others.length >= 5) setBeat(percentile(result.total, others));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [props.service, result]);
  const practice = result.mode === "practice";
  const [shown, setShown] = useState(props.reduced || !rewards ? result.total : 0);
  const [kick, setKick] = useState(!rewards);
  const [sheet, setSheet] = useState<"none" | "answers" | "share">("none");
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    scene?.clearRocks();
    if (!rewards) return; // reopening an earlier result: no fanfare
    const dur = props.reduced ? 1 : 1100;
    const t0 = performance.now();
    let raf = 0;
    let lastTick = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setShown(Math.round(result.total * (1 - Math.pow(1 - p, 3))));
      if (now - lastTick > 50 && p < 1) {
        lastTick = now;
        sfx.countTick();
      }
      if (p < 1) raf = requestAnimationFrame(step);
      else {
        sfx.final(Math.min(300, result.total / 4));
        scene?.celebrate(true);
        setTimeout(() => {
          setKick(true);
          sfx.stamp();
          if (rewards.newBest) setTimeout(() => sfx.fanfare(), 350);
        }, 400);
      }
    };
    raf = requestAnimationFrame(step);
    say(`Dig complete. ${result.total} points.`);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="layer">
      <div className="reveal-top" ref={topRef}>
        <div className="scorebox">
          <span className="label lv-label">
            {run.vault ? `Vault game ${run.vault}` : `Daily Dig ${run.dig.number}${practice ? " · practice" : ""}`} · complete
          </span>
          <div>
            <span className="big-num score">{shown.toLocaleString()}</span>
            <span className="unit">pts</span>
          </div>
          <div style={{ minHeight: 44 }}>
            {kick && (
              <div className="kicker px">
                {beat !== null ? `Rarer than ${beat}% of diggers` : practice ? "Practice run" : "One of today's first diggers"}
                <small>
                  {practice
                    ? "unranked"
                    : props.service?.kind === "local"
                      ? "vs. sample players (offline preview)"
                      : beat !== null
                        ? "vs. everyone who dug today"
                        : "the comparison fills in as others finish"}
                </small>
              </div>
            )}
          </div>
          {kick && rewards && (
            <div className="ribbons">
              {rewards.newBest && <span className="ribbon px best">New personal best!</span>}
              {rewards.first && <span className="ribbon px best">First dig!</span>}
              {rewards.streak > 1 && <span className="ribbon px">{rewards.streak} day streak</span>}
            </div>
          )}
          {kick && !practice && !props.username && (
            <button className="btn btn-y post-cta" onClick={props.onPost}>
              Post to the board
            </button>
          )}
        </div>
      </div>

      <div className="spacer" />

      <div className="bottom-stack" ref={dockRef}>
      <section className="breakdown px" aria-label="Score by level">
        {result.levels.map((l, i) => {
          const lv = l.challenge;
          return (
            <div className="bd-row" key={i}>
              <span className={`lv-n lv${lv.level}`}>{lv.level}</span>
              <span className="bd-cat">
                {lv.title}
                <small>
                  {lv.levelName} · x{lv.multiplier} · {breakdownNote(l.top.length)}
                </small>
              </span>
              <span className="bd-gems">
                {l.top.map((t, j) => (
                  <GemIcon key={j} tier={tierOf(t).key} size={3} />
                ))}
              </span>
              <span className="bd-pts">
                {l.points}
                {lv.multiplier > 1 && <small>{l.score} x{lv.multiplier}</small>}
              </span>
            </div>
          );
        })}
      </section>

      <div className="results-dock px dark">
        <button className="btn btn-y wide" onClick={() => (sfx.button(), track("answers_viewed"), setSheet("answers"))}>
          See the rarest answers
        </button>
        <button className="btn btn-go" onClick={() => (sfx.button(), track("share_clicked"), setSheet("share"))}>
          Share
        </button>
        <button className="btn" onClick={() => (sfx.button(), practice ? props.onVault() : props.onBoard())}>
          {practice ? "Vault" : "Board"}
        </button>
        <button className="btn btn-dark wide" onClick={() => (sfx.button(), props.onHome())}>
          Home
        </button>
      </div>
      </div>

      {sheet === "answers" && <AnswersSheet levels={result.levels.map((l) => l.challenge)} results={result.levels} onClose={() => setSheet("none")} />}
      {sheet === "share" && <ShareSheet number={run.dig.number} result={result} beat={beat} onClose={() => setSheet("none")} />}
    </div>
  );
}

function breakdownNote(found: number) {
  if (found >= SCORING.best) return `+${SCORING.cleanBonus} clean dig`;
  if (found === 0) return "no finds";
  return `${SCORING.best - found} empty`;
}
