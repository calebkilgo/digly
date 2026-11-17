"use client";

import { useEffect, useRef } from "react";
import { sfx } from "@/audio/sfx";

export function ScreenFrame({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  const back = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLElement>(null);
  useEffect(() => frame.current?.focus({ preventScroll: true }), []);
  return (
    <section className="screen" aria-label={title} ref={frame} tabIndex={-1}>
      <header className="screen-head">
        <button
          ref={back}
          className="btn btn-dark btn-sm"
          onClick={() => {
            sfx.button();
            onBack();
          }}
        >
          Back
        </button>
        <h1>{title}</h1>
      </header>
      <div className="screen-body">
        <div className="inner">{children}</div>
      </div>
    </section>
  );
}
