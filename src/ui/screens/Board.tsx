"use client";

import { useEffect, useMemo, useState } from "react";
import type { Board, ChallengeService, Dig } from "@/game/service/types";
import { rankEntries } from "@/game/rules/leaderboard";
import { ScreenFrame } from "./ScreenFrame";

export function BoardScreen(props: { service: ChallengeService | null; today: number; dig: Dig; username: string | null; onAccount: () => void; onBack: () => void }) {
  const { service, today } = props;
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!service) return;
    let live = true;
    service.board(today).then(
      (b) => live && setBoard(b),
      () => live && setErr(true),
    );
    return () => {
      live = false;
    };
  }, [service, today, props.username]);

  const ranked = useMemo(() => rankEntries((board?.entries ?? []).map((e) => ({ ...e, name: e.name || "Anonymous digger" }))), [board]);
  const record = ranked.find((e) => e.isYou);

  const youIdx = ranked.findIndex((e) => e.isYou);
  const head = ranked.slice(0, 15);
  const showYouBelow = youIdx >= 15;

  return (
    <ScreenFrame title="The Deep Board" onBack={props.onBack}>
      <p className="note">
        Daily Dig {props.dig.number}. Scores are ranked points across all three levels.
        {board?.sample ? " This offline preview fills the board with sample diggers." : ""}
      </p>
      {err && <p className="note">Couldn&apos;t load the board. Check your connection.</p>}
      {board && !board.sample && ranked.length === 0 && <p className="note">Nobody has finished a level yet today. Be the first.</p>}
      {board && !record && <p className="note">Finish a ranked level today to take your place on the board.</p>}
      {record && record.posted === false && (
        <div className="note" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>Your score is shown here but isn&apos;t posted. Make an account to put it on the board.</span>
          <button className="btn btn-sm btn-y" onClick={props.onAccount}>
            Post my score
          </button>
        </div>
      )}
      <div className="board px dark" role="table" aria-label="Today's rankings">
        {head.map((e) => (
          <Row key={e.id} e={e} />
        ))}
        {showYouBelow && (
          <>
            <div className="gap-row" aria-hidden>
              ···
            </div>
            <Row e={ranked[youIdx]} />
          </>
        )}
      </div>
      <p className="note">Ties on score go to whoever dug more unique finds. Full ties share a rank. Only accounts are posted. Friend groups come later.</p>
    </ScreenFrame>
  );
}

function Row({ e }: { e: ReturnType<typeof rankEntries>[number] }) {
  return (
    <div className={`slab ${e.rank <= 3 ? `r${e.rank}` : ""} ${e.isYou ? "you" : ""}`} role="row">
      <span className="rank" role="cell">
        {e.rank}
      </span>
      <span className="who" role="cell">
        {e.name}
        {e.posted === false ? " · not posted" : ""}
      </span>
      <span className="u" role="cell">
        {e.unique} finds
      </span>
      <span className="s" role="cell">
        {e.score}
      </span>
    </div>
  );
}
