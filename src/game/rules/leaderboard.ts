export interface BoardEntry {
  id: string;
  name: string;
  score: number;
  unique: number;
  isYou?: boolean;
  posted?: boolean;
}

export interface RankedEntry extends BoardEntry {
  rank: number;
}

// Score first, then more unique accepted answers. Full ties share a rank
// (competition ranking: 1, 2, 2, 4).
export function rankEntries(entries: BoardEntry[]): RankedEntry[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score || b.unique - a.unique);
  const out: RankedEntry[] = [];
  sorted.forEach((e, i) => {
    const prev = out[i - 1];
    const tied = prev && prev.score === e.score && prev.unique === e.unique;
    out.push({ ...e, rank: tied ? prev.rank : i + 1 });
  });
  return out;
}
