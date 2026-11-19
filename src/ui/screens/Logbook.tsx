"use client";

import { currentStreak, longestStreak, stats, type Progress } from "@/game/progress";
import { formatChallengeNumber } from "@/game/rules/schedule";
import { ScreenFrame } from "./ScreenFrame";
import { useEffect, useState } from "react";
import type { PlayerTopic } from "@/game/service/types";
import { TOPIC_LABEL, isTopic } from "@/game/data/topics";

export function LogbookScreen(props: { progress: Progress; today: number; name: string | null; onBack: () => void; loadTopics?: () => Promise<PlayerTopic[]> }) {
  const [topics, setTopics] = useState<PlayerTopic[] | null>(null);
  useEffect(() => {
    let live = true;
    props.loadTopics?.().then(
      (t) => live && setTopics(t),
      () => live && setTopics([]),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const s = stats(props.progress);
  const hist = s.history.slice(-14);
  const cells: [string, number | string][] = [
    ["Streak", currentStreak(props.progress, props.today)],
    ["Longest", longestStreak(props.progress)],
    ["Digs", s.played],
    ["Average", s.average],
    ["Best", s.best],
    ["Total finds", s.totalAnswers],
  ];
  const W = 320, H = 120, pad = 18;
  const top = Math.max(600, ...hist.map((h) => h.score));
  const bw = hist.length ? Math.min(28, (W - pad * 2) / hist.length - 6) : 0;

  return (
    <ScreenFrame title="Logbook" onBack={props.onBack}>
      <p className="note">{props.name ? `Digging as ${props.name}.` : "Guest digger on this device. Make an account in Options to post scores and keep your history."}</p>
      <div className="stat-grid">
        {cells.map(([k, v]) => (
          <div className="stat px" key={k}>
            <span className="label">{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="history px">
        <span className="label">Last {hist.length || "few"} ranked digs</span>
        {hist.length ? (
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Scores: ${hist.map((h) => h.score).join(", ")}`}>
            {[0, top / 2, top].map((v) => {
              const y = H - pad - (v / top) * (H - pad * 2);
              return <line key={v} x1={pad} x2={W - pad} y1={y} y2={y} stroke="#cdb68b" strokeWidth="1.5" strokeDasharray="4 4" />;
            })}
            {hist.map((h, i) => {
              const x = pad + i * ((W - pad * 2) / hist.length) + 3;
              const bh = Math.max(3, (h.score / top) * (H - pad * 2));
              return (
                <g key={h.day}>
                  <rect x={x} y={H - pad - bh} width={bw} height={bh} fill="#ee6a1f" stroke="#24160f" strokeWidth="2.5" rx="2" />
                  <text x={x + bw / 2} y={H - 4} fontSize="9" textAnchor="middle" fill="#24160f" fontWeight="700">
                    {formatChallengeNumber(h.day).slice(1)}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <p className="fine" style={{ marginTop: 8 }}>
            Your score history fills in after your first ranked dig.
          </p>
        )}
      </div>
      {topics && topics.length >= 2 && (
        <div className="history px topics">
          <span className="label">Your best topics</span>
          <ol>
            {topics.slice(0, 3).map((t) => (
              <li key={t.topic}>
                <b>{isTopic(t.topic) ? TOPIC_LABEL[t.topic] : t.topic}</b>
                <span className="fine">
                  {t.strength === 100 ? "Right at the average digger" : t.strength > 100 ? `${t.strength - 100}% above the average digger` : `${100 - t.strength}% below the average digger`} · {t.plays} levels
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </ScreenFrame>
  );
}
