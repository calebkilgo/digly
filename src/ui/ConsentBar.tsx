"use client";

import { useEffect, useState } from "react";
import { CONSENT_EVENT, analyticsConfigured, choose, mustAsk, privacySignal, savedChoice } from "@/lib/consent";

// Asks EU, EEA, UK and Swiss players before analytics runs. Nobody else sees it.
export function ConsentBar({ hidden }: { hidden: boolean }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!analyticsConfigured() || privacySignal() || savedChoice()) return;
    let live = true;
    void mustAsk().then((a) => live && !savedChoice() && setAsk(a));
    // answered from Options instead
    const done = () => setAsk(false);
    window.addEventListener(CONSENT_EVENT, done);
    return () => {
      live = false;
      window.removeEventListener(CONSENT_EVENT, done);
    };
  }, []);
  if (!ask || hidden) return null;
  const pick = (c: "yes" | "no") => {
    choose(c);
    setAsk(false);
  };
  return (
    <div className="consent-bar px" role="region" aria-label="Analytics choice">
      <p>
        Can Digly count how the game gets played (screens opened, levels finished)? No ads, nothing sold. <a href="/privacy">Privacy policy</a>
      </p>
      <div className="consent-actions">
        <button className="btn btn-sm btn-y" onClick={() => pick("yes")}>
          That&apos;s fine
        </button>
        <button className="btn btn-sm" onClick={() => pick("no")}>
          No thanks
        </button>
      </div>
    </div>
  );
}
