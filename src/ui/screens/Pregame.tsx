"use client";

import { useEffect, useRef } from "react";
import type { DiglyScene } from "@/scene/DiglyScene";
import { sfx } from "@/audio/sfx";
import { useSceneInsets } from "../SceneHost";
import { useFocus } from "./Home";
import type { Run } from "../GameShell";
import { GemLadder } from "../GemLadder";

// Focusing an input inside the tap is the only way iOS will raise the
// keyboard. This invisible field takes focus during the START tap and hands
// it to the real answer input a frame later.
export function primeKeyboard() {
  let el = document.getElementById("kb-primer") as HTMLInputElement | null;
  if (!el) {
    el = document.createElement("input");
    el.id = "kb-primer";
    el.setAttribute("aria-hidden", "true");
    el.tabIndex = -1;
    el.autocomplete = "off";
    Object.assign(el.style, { position: "fixed", top: "0", left: "0", opacity: "0", height: "1px", width: "1px", fontSize: "16px", pointerEvents: "none" });
    document.body.appendChild(el);
  }
  el.focus({ preventScroll: true });
}

export function PregameScreen(props: { scene: DiglyScene | null; run: Run; onBack: () => void; onGo: () => void }) {
  const { run, scene } = props;
  const card = useRef<HTMLDivElement>(null);
  const none = useRef<HTMLDivElement>(null);
  const go = useRef<HTMLButtonElement>(null);
  const wide = useFocus(scene);
  useSceneInsets(scene, none, wide ? none : card);
  useEffect(() => card.current?.focus({ preventScroll: true }), []);
  const practice = run.mode === "practice";

  return (
    <div className="layer pregame-layer">
      <div ref={none} />
      <div className="spacer" />
      <section className="pregame px" ref={card} aria-labelledby="pg-title" tabIndex={-1}>
        <div className="order-head">
          <span className="label">{practice ? "Vault · unranked" : "Ranked dig"}</span>
          <span className="order-num">{run.dig.number}</span>
        </div>
        <h2 id="pg-title" className="card-title">
          3 levels. Each one deeper.
        </h2>
        <ol className="level-chips" aria-label="Levels">
          {run.dig.levels.map((l) => (
            <li key={l.level} className={`chip-lv lv${l.level}`}>
              <span className="lv-n">Level {l.level}</span>
              <span className="lv-line">{l.level <= run.results.length ? "Dug" : `${l.seconds} sec`}</span>
              <span className="lv-line">Best {l.scored} count</span>
              <span className="lv-x">x{l.multiplier}</span>
            </li>
          ))}
        </ol>
        <ul className="rules">
          <li>
            <span className="pip px">?</span>
            <span>Each category stays secret until its 40-second clock starts.</span>
          </li>
          <li>
            <span className="pip px">!</span>
            <span>
              <b>Think rare.</b> Answers everyone says are worth almost nothing.
            </span>
          </li>
          <li>
            <span className="pip px">3</span>
            <span>
              Name as many as you can. <b>Your best 3 count.</b> Fill all 3 for a bonus; an empty level costs you.
            </span>
          </li>
          <li>
            <span className="pip px">0</span>
            <span>Wrong answers cost nothing. Guess freely.</span>
          </li>
        </ul>
        <span className="label">Treasure ranks</span>
        <GemLadder />
        <div className="pregame-actions">
          <button
            className="btn btn-dark"
            onClick={() => {
              sfx.button();
              props.onBack();
            }}
          >
            Back
          </button>
          <button
            ref={go}
            className="btn btn-big btn-y"
            onClick={() => {
              sfx.unlock();
              primeKeyboard();
              props.onGo();
            }}
          >
            START
          </button>
        </div>
      </section>
    </div>
  );
}
