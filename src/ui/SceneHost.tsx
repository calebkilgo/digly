"use client";

import { useEffect, useRef } from "react";
import type { DiglyScene } from "@/scene/DiglyScene";

export function SceneHost({ seed, onReady, onError }: { seed: number; onReady: (s: DiglyScene) => void; onError: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const seedRef = useRef(seed);
  const cbs = useRef({ onReady, onError });
  cbs.current = { onReady, onError };

  useEffect(() => {
    let scene: DiglyScene | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { DiglyScene } = await import("@/scene/DiglyScene");
        if (cancelled || !host.current) return;
        scene = await DiglyScene.create(host.current, seedRef.current);
        if (cancelled) {
          scene.destroy();
          return;
        }
        cbs.current.onReady(scene);
      } catch (e) {
        console.error(e);
        cbs.current.onError();
      }
    })();
    return () => {
      cancelled = true;
      scene?.destroy();
    };
  }, []);

  return <div ref={host} className="scene-host" />;
}

// Measures the HUD chrome so the scene can frame Digly in the space left over.
export function useSceneInsets(
  scene: DiglyScene | null,
  topRef: React.RefObject<HTMLElement | null>,
  bottomRef: React.RefObject<HTMLElement | null>,
  enabled = true,
) {
  useEffect(() => {
    if (!scene || !enabled) return;
    const measure = () => {
      const appH = topRef.current?.closest(".app")?.getBoundingClientRect() ?? bottomRef.current?.closest(".app")?.getBoundingClientRect();
      const t = topRef.current?.getBoundingClientRect();
      const b = bottomRef.current?.getBoundingClientRect();
      const top = t && appH ? t.bottom - appH.top : 0;
      const bottom = b && appH ? appH.bottom - b.top : 0;
      scene.setInsets(Math.max(0, top), Math.max(0, bottom));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (topRef.current) ro.observe(topRef.current);
    if (bottomRef.current) ro.observe(bottomRef.current);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [scene, topRef, bottomRef, enabled]);
}
