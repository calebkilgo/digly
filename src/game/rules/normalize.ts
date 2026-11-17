// Text normalization shared by the answer index and submissions.
// Keep this conservative: aliases do the heavy lifting, not fuzzy guessing.

const WORD_SUBS: Record<string, string> = {
  st: "saint",
  mt: "mount",
  "&": "and",
};

export function normalize(raw: string): string {
  let s = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  s = s.replace(/&/g, " and ");
  // keep C++ / C# / F# apart from C and F
  s = s.replace(/\+\+/g, " plus plus ").replace(/#/g, " sharp ");
  s = s.replace(/['’`]/g, "");
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  if (!s) return "";
  const words = s.split(" ").map((w) => WORD_SUBS[w] ?? w);
  if (words[0] === "the" && words.length > 1) words.shift();
  return words.join(" ");
}

// Spaceless form, so "shih tzu" == "shihtzu" and "guinea bissau" == "guineabissau".
export function compact(normalized: string): string {
  return normalized.replace(/ /g, "");
}

// Optimal string alignment distance, capped. Returns cap+1 when over the cap.
export function editDistance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}
