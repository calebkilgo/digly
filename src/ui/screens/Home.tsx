"use client";

import { useEffect, useRef, useState } from "react";
import type { DiglyScene } from "@/scene/DiglyScene";
import type { DayStatus, Dig } from "@/game/service/types";
import { currentStreak, type Progress } from "@/game/progress";
import { formatCountdown, nextResetAt } from "@/game/rules/schedule";
import { sfx } from "@/audio/sfx";
import { useSceneInsets } from "../SceneHost";
import { Icon, Logo } from "../art";
import type { Screen } from "../GameShell";

export const DISCORD = "https://discord.gg/pGFDrzvfXu";
export const INSTAGRAM = "https://www.instagram.com/digly_official";

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px) and (min-height: 560px)");
    const f = () => setWide(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return wide;
}

export function useFocus(scene: DiglyScene | null) {
  const wide = useWide();
  useEffect(() => scene?.setFocusX(wide ? 0.34 : 0.5), [scene, wide]);
  return wide;
}

export function HomeScreen(props: {
  scene: DiglyScene | null;
  hidden: boolean;
  dig: Dig;
  status: DayStatus | null;
  netError: string | null;
  progress: Progress;
  today: number;
  onPlay: () => void;
  onViewToday: () => void;
  onNav: (s: Screen) => void;
  onSuggest: () => void;
}) {
  const { scene, dig, progress, today } = props;
  const top = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const wide = useFocus(scene);
  useSceneInsets(scene, top, wide ? rail : panel, !props.hidden);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { status } = props;
  // the server is the truth for today; the local record covers a slow load
  const done = status ? status.next === null && status.ranked.length === 3 : !!progress.ranked[today];
  const rec = progress.ranked[today];
  const total = status && status.ranked.length ? status.total : rec?.score;
  const partway = !!status && status.ranked.length > 0 && !done;
  const streak = currentStreak(progress, today);
  const playRef = useRef<HTMLButtonElement>(null);

  const tap = (f: () => void) => () => {
    sfx.button();
    f();
  };

  return (
    <div className="layer home-layer" aria-hidden={props.hidden} style={props.hidden ? { visibility: "hidden" } : undefined}>
      <header className="home-top" ref={top}>
        <div className="home-brand">
          <h1 style={{ margin: 0 }}>
            <Logo />
          </h1>
          <span className="tagline">Dig deep.</span>
        </div>
        <div className="streak px" title="Daily streak">
          <Icon name="lamp" size={3} />
          <div>
            <div className="num">{streak}</div>
            <div className="label">streak</div>
          </div>
        </div>
      </header>

      <div className="spacer" />

      <div className="home-col" ref={panel}>
      <section className="home-panel px" aria-labelledby="today-title">
        <div className="order-head">
          <h2 className="card-title" id="today-title">
            Daily Dig
          </h2>
          <span className="order-num">{dig.number}</span>
        </div>
        <ol className="level-chips" aria-label="Today's three levels">
          {dig.levels.map((l) => (
            <li key={l.level} className={`chip-lv lv${l.level}`}>
              <span className="lv-n">Level {l.level}</span>
              <span className="lv-line">{status?.ranked[l.level - 1]?.challenge.title ?? `${l.seconds} sec`}</span>
              <span className="lv-line">Best {l.scored} count</span>
              <span className="lv-x">x{l.multiplier}</span>
            </li>
          ))}
        </ol>
        <ul className="facts">
          <li>45 seconds a level. Name as many as you can. Your best 3 count.</li>
          <li>
            <b>Rare answers score big.</b> Each level is harder and worth more.
          </li>
        </ul>
        {done ? (
          <button className="btn btn-big btn-y" onClick={tap(props.onViewToday)} ref={playRef}>
            RESULTS
          </button>
        ) : (
          <button className="btn btn-big btn-y" onClick={tap(props.onPlay)} disabled={!status} ref={playRef}>
            {partway ? `CONTINUE · L${status!.next}` : "START"}
          </button>
        )}
        <div className="next-row">
          <p className="next-line">
            {total ? `Today: ${total.toLocaleString()} pts · ` : ""}Next dig in <b>{formatCountdown(nextResetAt(now) - now)}</b>
          </p>
          <div className="socials">
            <a className="btn" href={DISCORD} target="_blank" rel="noopener noreferrer" aria-label="Digly on Discord" title="Discord" onClick={() => sfx.button()}>
              <Icon name="discord" size={2} />
            </a>
            <a className="btn" href={INSTAGRAM} target="_blank" rel="noopener noreferrer" aria-label="Digly on Instagram" title="Instagram" onClick={() => sfx.button()}>
              <Icon name="insta" size={2} />
            </a>
          </div>
        </div>
        {props.netError && <p className="fine">{props.netError}</p>}
      </section>
      <button className="btn btn-sm suggest-btn" onClick={tap(props.onSuggest)}>
        Suggest a prompt
      </button>
      </div>

      <nav className="rail" ref={rail} aria-label="Workshop">
        <button className="btn tool" onClick={tap(() => props.onNav("board"))}>
          <Icon name="board" />
          Board
        </button>
        <button className="btn tool" onClick={tap(() => props.onNav("vault"))}>
          <Icon name="vault" />
          Vault
        </button>
        <button className="btn tool" onClick={tap(() => props.onNav("logbook"))}>
          <Icon name="log" />
          Stats
        </button>
        <button className="btn tool" onClick={tap(() => props.onNav("settings"))}>
          <Icon name="gear" />
          Options
        </button>
      </nav>
    </div>
  );
}
