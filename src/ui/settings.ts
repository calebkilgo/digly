"use client";

import { useCallback, useEffect, useState } from "react";

export type MotionPref = "system" | "reduced" | "full";

export interface Settings {
  sound: boolean;
  music: boolean;
  motion: MotionPref;
  highContrast: boolean;
  name: string;
}

const KEY = "digly.settings.v1";
const DEFAULTS: Settings = { sound: true, music: true, motion: "system", highContrast: false, name: "You" };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  useEffect(() => setSettings(load()), []);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  return [settings, update] as const;
}

export function useSystemReducedMotion() {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setRm(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return rm;
}

// Keeps the app sized to the visible area so the mobile keyboard never
// covers the input or pushes the HUD off screen.
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const apply = () => {
      const h = vv ? vv.height : window.innerHeight;
      const top = vv ? vv.offsetTop : 0;
      root.style.setProperty("--app-h", `${Math.round(h)}px`);
      root.style.setProperty("--app-top", `${Math.round(top)}px`);
      // iOS sometimes scrolls the layout viewport when focusing an input
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    apply();
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);
}
