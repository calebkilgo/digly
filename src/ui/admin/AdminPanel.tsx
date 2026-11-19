"use client";

import { useCallback, useEffect, useState } from "react";
import "./admin.css";
import { TOPIC_LABEL } from "@/game/data/topics";

// class names in admin.css are prefixed so they can't clash with the game's
const s = new Proxy({} as Record<string, string>, { get: (_, k) => `adm-${String(k)}` });

// The admin panel. Everything here is read from and written to the server,
// so every admin sees the same thing; it refreshes on its own every few
// seconds and right after any change.

type Status = "new" | "planned" | "added" | "dismissed";
type Tab = "overview" | "growth" | "answers" | "ideas" | "team";

interface Idea {
  id: number;
  text: string;
  day: number;
  createdAt: number;
  status: Status;
  updatedBy: string | null;
  updatedAt: number | null;
}
interface LogEntry {
  actor: string;
  action: string;
  detail: string;
  at: number;
}
interface Overview {
  day: number;
  number: string;
  backend: string;
  stats: { players: number; accounts: number; unlimited: number; diggersToday: number; finishedToday: number };
  categories: { level: number; slug: string; title: string }[];
}
interface LiveStats {
  at: number;
  diggingNow: number;
  ranked: number;
  practice: number;
  vault: number;
  byLevel: number[];
  last5: number;
  last15: number;
  lastHour: number;
  buckets: number[];
}
interface Category {
  slug: string;
  title: string;
  level: number;
  vault: boolean;
}
interface AnswerRow {
  key: string;
  name: string;
  aliases: string[];
  rating: number;
  tier: string;
  status: "list" | "added" | "changed" | "removed";
  by: string | null;
}
interface AnswerList {
  slug: string;
  title: string;
  level: number;
  count: number;
  answers: AnswerRow[];
}
interface Rejects {
  plays: number;
  answersInList: number;
  rejects: { text: string; n: number }[];
}

// the live player count moves fast; the rest (stats, ideas, log, admins) doesn't
const LIVE_MS = 8000;
const REFRESH_MS = 60_000;
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "growth", label: "Growth" },
  { id: "answers", label: "Answers" },
  { id: "ideas", label: "Ideas" },
  { id: "team", label: "Team" },
];
const STATUSES: Status[] = ["new", "planned", "added", "dismissed"];
const TOPIC_NAMES: Record<string, string> = TOPIC_LABEL;
const TIER_NAMES: Record<string, string> = { copper: "Bronze", gold: "Gold", diamond: "Diamond", ruby: "Ruby", platinum: "Platinum" };
const ACTIONS: Record<string, string> = {
  admin_added: "made an admin:",
  admin_removed: "removed admin from",
  idea_new: "moved back to new:",
  idea_planned: "planned idea:",
  idea_added: "marked as added:",
  idea_dismissed: "dismissed idea:",
  answer_add: "saved answer",
  answer_remove: "removed answer",
  answer_undo: "undid the change to",
};

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Request failed (${res.status})`);
  return data as T;
}

function ago(t: number) {
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const fmt = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString());

export function AdminPanel({ me }: { me: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [live, setLive] = useState<LiveStats | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [admins, setAdmins] = useState<{ id: string; username: string }[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [synced, setSynced] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [, tick] = useState(0);

  // the tab lives in the address bar, so a refresh or a shared link opens the same page
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as Tab;
      if (TABS.some((t) => t.id === h)) setTab(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };

  const refresh = useCallback(async () => {
    try {
      const [o, lv, i, l, a] = await Promise.all([
        api<Overview>("/api/admin/overview"),
        api<LiveStats>("/api/admin/live"),
        api<{ suggestions: Idea[] }>("/api/admin/suggestions"),
        api<{ log: LogEntry[] }>("/api/admin/log"),
        api<{ admins: { id: string; username: string }[] }>("/api/admin/admins"),
      ]);
      setOverview(o);
      setLive(lv);
      setIdeas(i.suggestions);
      setLog(l.log);
      setAdmins(a.admins);
      setSynced(Date.now());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  const refreshLive = useCallback(async () => {
    try {
      setLive(await api<LiveStats>("/api/admin/live"));
      setSynced(Date.now());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    api<{ categories: Category[] }>("/api/admin/rejects").then((r) => setCats(r.categories), () => undefined);
    // nothing polls while the tab is in the background
    const shown = () => document.visibilityState === "visible";
    const all = setInterval(() => shown() && void refresh(), REFRESH_MS);
    const live = setInterval(() => shown() && void refreshLive(), LIVE_MS);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    const back = () => shown() && void refresh();
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(all);
      clearInterval(live);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", back);
    };
  }, [refresh, refreshLive]);

  const newIdeas = ideas.filter((i) => i.status === "new").length;

  return (
    <div className={s.root}>
      <header className={s.topbar}>
        <div className={s.barIn}>
          <div className={s.brand}>
            DIGLY<span>/ Admin</span>
          </div>
          <nav className={s.nav}>
            {TABS.map((t) => (
              <button key={t.id} className={`${s.navItem} ${tab === t.id ? s.navOn : ""}`} onClick={() => go(t.id)}>
                {t.label}
                {t.id === "ideas" && newIdeas > 0 && <span className={s.count}>{newIdeas}</span>}
              </button>
            ))}
          </nav>
          <div className={s.meta}>
            <span className={s.status}>
              <span className={`${s.dot} ${offline ? s.dotOff : ""}`} />
              {offline ? "Offline" : synced ? `Live · ${ago(synced)}` : "Connecting"}
            </span>
            <span className={s.dim}>{me}</span>
            <a className={s.exit} href="/">
              Exit
            </a>
          </div>
        </div>
      </header>

      <main className={s.wrap}>
        {tab === "overview" && <OverviewTab overview={overview} live={live} log={log} onMore={() => go("team")} />}
        {tab === "growth" && <GrowthTab />}
        {tab === "answers" && <AnswersTab cats={cats} synced={synced} onChange={refresh} />}
        {tab === "ideas" && <Ideas ideas={ideas} onChange={refresh} />}
        {tab === "team" && (
          <div className={s.split}>
            <div>
              <Admins me={me} admins={admins} onChange={refresh} />
              <EmailCheck />
            </div>
            <Log log={log} />
          </div>
        )}
      </main>
    </div>
  );
}

// ---- overview -------------------------------------------------------------

function OverviewTab({ overview, live, log, onMore }: { overview: Overview | null; live: LiveStats | null; log: LogEntry[]; onMore: () => void }) {
  const st = overview?.stats;
  const max = Math.max(1, ...(live?.buckets ?? [0]));
  return (
    <>
      <section className={s.panel}>
        <div className={s.liveGrid}>
          <div>
            <div className={s.label}>
              <span className={`${s.dot} ${s.pulse}`} />
              Digging now
            </div>
            <div className={s.hero}>{fmt(live?.diggingNow)}</div>
            <div className={s.chips}>
              <span>Daily {fmt(live?.ranked)}</span>
              <span>Practice {fmt(live?.practice)}</span>
              <span>Vault {fmt(live?.vault)}</span>
            </div>
            <div className={s.chips}>
              <span>L1 {fmt(live?.byLevel[0])}</span>
              <span>L2 {fmt(live?.byLevel[1])}</span>
              <span>L3 {fmt(live?.byLevel[2])}</span>
            </div>
          </div>
          <div>
            <div className={s.cells}>
              {(
                [
                  ["Last 5 min", live?.last5],
                  ["Last 15 min", live?.last15],
                  ["Last hour", live?.lastHour],
                ] as const
              ).map(([label, v]) => (
                <div className={s.cell} key={label}>
                  <div className={s.label}>{label}</div>
                  <div className={s.num}>{fmt(v)}</div>
                </div>
              ))}
            </div>
            <div className={s.bars} aria-label="Players starting a level, every 5 minutes over the last hour">
              {(live?.buckets ?? Array(12).fill(0)).map((n, i) => (
                <div key={i} className={s.bar} title={`${n} player${n === 1 ? "" : "s"}, ${55 - i * 5}–${60 - i * 5} min ago`}>
                  <div style={{ height: `${(n / max) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className={s.axis}>
              <span>−60 min</span>
              <span>now</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`${s.panel} ${s.flush}`}>
        <div className={s.strip}>
          {(
            [
              ["Players", st?.players],
              ["Accounts", st?.accounts],
              ["Unlimited", st?.unlimited],
              ["Dug today", st?.diggersToday],
              ["Finished today", st?.finishedToday],
            ] as const
          ).map(([label, v]) => (
            <div className={s.cell} key={label}>
              <div className={s.label}>{label}</div>
              <div className={s.num}>{fmt(v)}</div>
            </div>
          ))}
        </div>
      </section>

      <div className={s.split}>
        <section className={s.panel}>
          <div className={s.head}>
            <h2>Today · Daily Dig {overview?.number ?? ""}</h2>
            {overview && <span className={s.tag}>{overview.backend === "supabase" ? "Supabase" : "Memory store"}</span>}
          </div>
          <ul className={s.rows}>
            {(overview?.categories ?? []).map((c) => (
              <li key={c.level} className={s.rowItem}>
                <span className={s.dim}>Level {c.level}</span>
                <span>{c.title}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={s.panel}>
          <div className={s.head}>
            <h2>Recent activity</h2>
            <button className={s.textBtn} onClick={onMore}>
              View all
            </button>
          </div>
          <LogRows log={log.slice(0, 6)} />
        </section>
      </div>
    </>
  );
}

// ---- answers: the list editor and what players typed that didn't count ----

function AnswersTab({ cats, synced, onChange }: { cats: Category[]; synced: number | null; onChange: () => Promise<void> }) {
  const [slug, setSlug] = useState("");
  const [list, setList] = useState<AnswerList | null>(null);
  const [rej, setRej] = useState<Rejects | null>(null);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "edited" | "removed">("all");
  const [form, setForm] = useState({ name: "", aliases: "", rating: "75" });
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (which: string) => {
    if (!which) return;
    try {
      const r = await api<AnswerList>(`/api/admin/answers?slug=${encodeURIComponent(which)}`);
      setList((cur) => (cur && cur.slug !== which ? cur : r));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load that list.");
    }
  }, []);

  useEffect(() => {
    setList(null);
    setRej(null);
    setEditing(null);
    setErr("");
    setForm({ name: "", aliases: "", rating: "75" });
    if (!slug) return;
    void load(slug);
    api<Rejects>(`/api/admin/rejects?slug=${encodeURIComponent(slug)}`).then(setRej, () => undefined);
  }, [slug, load]);

  // follow the panel's refresh so changes from other admins show up
  useEffect(() => {
    if (slug && synced) void load(slug);
  }, [synced, slug, load]);

  const send = async (body: Record<string, unknown>) => {
    setErr("");
    setBusy(true);
    try {
      await api("/api/admin/answers", { slug, ...body });
      await load(slug);
      await onChange();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save that.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setEditing(null);
    setForm({ name: "", aliases: "", rating: "75" });
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) return;
    const aliases = form.aliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    if (await send({ action: "add", name, aliases, rating: Number(form.rating), ...(editing ? { replaces: editing } : {}) })) reset();
  };

  const addReject = async (text: string) => {
    if (await send({ action: "add", name: text.replace(/\b\w/g, (c) => c.toUpperCase()), aliases: [], rating: 75 })) {
      setRej((r) => (r ? { ...r, rejects: r.rejects.filter((x) => x.text !== text) } : r));
    }
  };

  const all = list?.answers ?? [];
  const needle = q.trim().toLowerCase();
  const rows = all.filter((a) => {
    if (show === "edited" && (a.status === "list" || a.status === "removed")) return false;
    if (show === "removed" && a.status !== "removed") return false;
    if (!needle) return true;
    return a.name.toLowerCase().includes(needle) || a.aliases.some((x) => x.includes(needle));
  });
  const edited = all.filter((a) => a.status === "added" || a.status === "changed").length;
  const removed = all.filter((a) => a.status === "removed").length;
  const exact = needle && all.some((a) => a.status !== "removed" && (a.name.toLowerCase() === needle || a.aliases.includes(needle)));

  return (
    <>
      <section className={s.panel}>
        <div className={s.pickRow}>
          <div className={s.field}>
            <label className={s.label} htmlFor="adm-cat">
              Category
            </label>
            <select id="adm-cat" className={s.input} value={slug} onChange={(e) => setSlug(e.target.value)}>
              <option value="">Choose a category</option>
              <optgroup label="Daily">
                {cats
                  .filter((c) => !c.vault)
                  .map((c) => (
                    <option key={c.slug} value={c.slug}>
                      L{c.level} · {c.title}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Vault">
                {cats
                  .filter((c) => c.vault)
                  .map((c) => (
                    <option key={c.slug} value={c.slug}>
                      L{c.level} · {c.title}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
          {list && (
            <div className={s.cells}>
              <div className={s.cell}>
                <div className={s.label}>Answers</div>
                <div className={s.num}>{list.count}</div>
              </div>
              <div className={s.cell}>
                <div className={s.label}>Edited</div>
                <div className={s.num}>{edited}</div>
              </div>
              <div className={s.cell}>
                <div className={s.label}>Removed</div>
                <div className={s.num}>{removed}</div>
              </div>
              <div className={s.cell}>
                <div className={s.label}>Ranked plays</div>
                <div className={s.num}>{rej ? rej.plays : "—"}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {!slug && <div className={s.empty}>Choose a category to see its answers.</div>}
      {slug && !list && !err && <div className={s.empty}>Loading…</div>}
      {err && <div className={s.error}>{err}</div>}

      {list && (
        <div className={s.answersGrid}>
          <section className={s.panel}>
            <form
              className={s.addForm}
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className={s.label}>{editing ? "Edit answer" : "Add answer"}</div>
              <div className={s.formRow}>
                <input className={s.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name, e.g. White Oak" aria-label="Answer" />
                <input
                  className={s.input}
                  value={form.aliases}
                  onChange={(e) => setForm({ ...form, aliases: e.target.value })}
                  placeholder="Other spellings, comma separated"
                  aria-label="Other spellings"
                />
                <input
                  className={`${s.input} ${s.rarity}`}
                  type="number"
                  min={1}
                  max={100}
                  value={form.rating}
                  onChange={(e) => setForm({ ...form, rating: e.target.value })}
                  title="Rarity: 1 is the most common, 100 the rarest"
                  aria-label="Rarity 1 to 100"
                />
                <button className={`${s.btn} ${s.primary}`} disabled={busy || !form.name.trim()}>
                  {editing ? "Save" : "Add"}
                </button>
                {editing && (
                  <button type="button" className={s.btn} onClick={reset}>
                    Cancel
                  </button>
                )}
              </div>
              <div className={s.hint}>Rarity runs from 1 (almost everyone says it) to 100 (almost nobody does). Live play adjusts it over time.</div>
            </form>

            <div className={s.toolbar}>
              <input className={`${s.input} ${s.search}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search answers and spellings" aria-label="Search answers" />
              <div className={s.seg}>
                {(["all", "edited", "removed"] as const).map((t) => (
                  <button key={t} className={show === t ? s.segOn : ""} onClick={() => setShow(t)}>
                    {t === "all" ? "All" : t === "edited" ? `Edited ${edited}` : `Removed ${removed}`}
                  </button>
                ))}
              </div>
            </div>

            {needle && !exact && (
              <div className={s.notice}>
                <span>&ldquo;{q.trim()}&rdquo; doesn&apos;t count yet.</span>
                <button className={s.textBtn} onClick={() => setForm({ name: q.trim(), aliases: "", rating: "75" })}>
                  Add it
                </button>
              </div>
            )}

            {rows.length === 0 ? (
              <div className={s.empty}>No matches.</div>
            ) : (
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Answer</th>
                    <th className={s.r}>Rarity</th>
                    <th>Tier</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 400).map((a) => (
                    <tr key={`${a.status}-${a.key}`} className={a.status === "removed" ? s.gone : ""}>
                      <td>
                        <span className={s.name}>{a.name}</span>
                        {a.status !== "list" && (
                          <span className={`${s.tag} ${s[`tag_${a.status}`]}`}>
                            {a.status}
                            {a.by ? ` · ${a.by}` : ""}
                          </span>
                        )}
                        {a.aliases.length > 0 && <div className={s.dim}>{a.aliases.join(", ")}</div>}
                      </td>
                      <td className={s.r}>{a.rating}</td>
                      <td className={s.dim}>{a.status === "removed" ? "" : TIER_NAMES[a.tier] ?? a.tier}</td>
                      <td className={s.actions}>
                        {a.status === "removed" ? (
                          <button className={s.textBtn} disabled={busy} onClick={() => void send({ action: "undo", key: a.key, name: a.name })}>
                            Restore
                          </button>
                        ) : (
                          <>
                            <button
                              className={s.textBtn}
                              disabled={busy}
                              onClick={() => {
                                setEditing(a.key);
                                setForm({ name: a.name, aliases: a.aliases.join(", "), rating: String(a.rating) });
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              Edit
                            </button>
                            {a.status !== "list" && (
                              <button className={s.textBtn} disabled={busy} title="Go back to how the code has it" onClick={() => void send({ action: "undo", key: a.key, name: a.name })}>
                                Undo
                              </button>
                            )}
                            {a.status !== "added" && (
                              <button
                                className={`${s.textBtn} ${s.danger}`}
                                disabled={busy}
                                onClick={() => {
                                  if (confirm(`Remove "${a.name}" from ${list.title}? It stops counting for everyone.`)) void send({ action: "remove", name: a.name });
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length > 400 && <div className={s.hint}>Showing 400 of {rows.length}. Search to narrow it down.</div>}
          </section>

          <section className={s.panel}>
            <div className={s.head}>
              <h2>Missing answers</h2>
            </div>
            <div className={s.hint}>What players typed in this category that didn&apos;t count, most common first.</div>
            {!rej ? (
              <div className={s.empty}>Loading…</div>
            ) : rej.rejects.length === 0 ? (
              <div className={s.empty}>Nothing yet.</div>
            ) : (
              <ul className={s.rows}>
                {rej.rejects.slice(0, 80).map((r) => (
                  <li key={r.text} className={s.rowItem}>
                    <span>
                      {r.text} <span className={s.dim}>×{r.n}</span>
                    </span>
                    <button className={s.textBtn} disabled={busy} onClick={() => void addReject(r.text)}>
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}

// ---- prompt ideas ----------------------------------------------------------

function Ideas({ ideas, onChange }: { ideas: Idea[]; onChange: () => Promise<void> }) {
  const [filter, setFilter] = useState<Status | "all">("new");
  const [err, setErr] = useState("");
  const shown = filter === "all" ? ideas : ideas.filter((i) => i.status === filter);
  const count = (st: Status) => ideas.filter((i) => i.status === st).length;

  const setStatus = async (id: number, status: Status) => {
    setErr("");
    try {
      await api("/api/admin/suggestions", { id, status });
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save that.");
    }
  };

  return (
    <section className={s.panel}>
      <div className={s.head}>
        <h2>Prompt ideas</h2>
        <div className={s.seg}>
          {[...STATUSES, "all" as const].map((st) => (
            <button key={st} className={filter === st ? s.segOn : ""} onClick={() => setFilter(st)}>
              {st[0].toUpperCase() + st.slice(1)} {st !== "all" ? count(st) : ideas.length}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className={s.empty}>Nothing here.</div>
      ) : (
        <ul className={s.rows}>
          {shown.map((i) => (
            <li className={s.rowItem} key={i.id}>
              <div>
                <div className={s.name}>{i.text}</div>
                <div className={s.dim}>
                  Sent {ago(i.createdAt)}
                  {i.updatedBy ? ` · ${i.status} by ${i.updatedBy}${i.updatedAt ? ` ${ago(i.updatedAt)}` : ""}` : ""}
                </div>
              </div>
              <div className={s.seg}>
                {STATUSES.map((st) => (
                  <button key={st} className={i.status === st ? s.segOn : ""} onClick={() => i.status !== st && void setStatus(i.id, st)}>
                    {st[0].toUpperCase() + st.slice(1)}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {err && <div className={s.error}>{err}</div>}
    </section>
  );
}

// ---- growth ----------------------------------------------------------------

interface GrowthDay {
  day: number;
  players: number;
  newPlayers: number;
  accounts: number;
  rankedStarted: number;
  rankedFinished: number;
  backD1: number;
  backD7: number;
}
interface Segment {
  topic: string;
  players: number;
  plays: number;
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

// Loaded when the tab opens (and on Refresh), not on the panel's timer: these
// queries read every attempt.
function GrowthTab() {
  const [data, setData] = useState<{ today: number; days: GrowthDay[]; segments: Segment[]; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      setData(await api("/api/admin/growth"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const days = [...(data?.days ?? [])].reverse();
  const week = (data?.days ?? []).slice(-7);
  const sum = (k: keyof GrowthDay, rows: GrowthDay[]) => rows.reduce((a, r) => a + r[k], 0);
  // returns only count once the day they're measured on has passed
  const d1Rows = (data?.days ?? []).filter((r) => r.day + 1 < (data?.today ?? 0));
  const d7Rows = (data?.days ?? []).filter((r) => r.day + 7 < (data?.today ?? 0));
  const segMax = Math.max(1, ...(data?.segments ?? []).map((x) => x.plays));

  return (
    <>
      <section className={`${s.panel} ${s.flush}`}>
        <div className={s.strip}>
          {(
            [
              ["Players, last 7 days", fmt(data ? sum("players", week) : undefined)],
              ["New players, last 7 days", fmt(data ? sum("newPlayers", week) : undefined)],
              ["Accounts, last 7 days", fmt(data ? sum("accounts", week) : undefined)],
              ["Came back next day", data ? pct(sum("backD1", d1Rows), sum("newPlayers", d1Rows)) : "—"],
              ["Came back a week later", data ? pct(sum("backD7", d7Rows), sum("newPlayers", d7Rows)) : "—"],
            ] as const
          ).map(([label, v]) => (
            <div className={s.cell} key={label}>
              <div className={s.label}>{label}</div>
              <div className={s.num}>{v}</div>
            </div>
          ))}
        </div>
      </section>
      {(err || data?.error) && <div className={s.error}>{err || data?.error}</div>}
      <div className={s.split}>
        <section className={s.panel}>
          <div className={s.head}>
            <h2>Last 30 days</h2>
            <button className={s.textBtn} disabled={busy} onClick={() => void load()}>
              {busy ? "Loading…" : "Refresh"}
            </button>
          </div>
          {days.length === 0 ? (
            <div className={s.empty}>{busy ? "Loading…" : "No plays yet."}</div>
          ) : (
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Day</th>
                  <th className={s.r}>Players</th>
                  <th className={s.r}>New</th>
                  <th className={s.r}>Accounts</th>
                  <th className={s.r}>Daily done</th>
                  <th className={s.r}>Back D1</th>
                  <th className={s.r}>Back D7</th>
                </tr>
              </thead>
              <tbody>
                {days.map((r) => (
                  <tr key={r.day}>
                    <td>
                      #{r.day}
                      {r.day === data?.today && <span className={s.dim}> · today</span>}
                    </td>
                    <td className={s.r}>{fmt(r.players)}</td>
                    <td className={s.r}>{fmt(r.newPlayers)}</td>
                    <td className={s.r}>{fmt(r.accounts)}</td>
                    <td className={s.r} title={`${r.rankedFinished} of ${r.rankedStarted} who started the daily dig finished all 3 levels`}>
                      {pct(r.rankedFinished, r.rankedStarted)}
                    </td>
                    <td className={s.r}>{r.day + 1 < (data?.today ?? 0) ? pct(r.backD1, r.newPlayers) : "—"}</td>
                    <td className={s.r}>{r.day + 7 < (data?.today ?? 0) ? pct(r.backD7, r.newPlayers) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className={s.dim}>
            Players means anyone who started a level that day, guests included. Back D1 and D7 are the share of that day&apos;s new players who played again
            one and seven days later.
          </p>
        </section>
        <section className={s.panel}>
          <div className={s.head}>
            <h2>Topics</h2>
          </div>
          {(data?.segments ?? []).length === 0 ? (
            <div className={s.empty}>{busy ? "Loading…" : "Not enough plays yet."}</div>
          ) : (
            <ul className={s.rows}>
              {data!.segments.map((x) => (
                <li className={s.rowItem} key={x.topic} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>{TOPIC_NAMES[x.topic] ?? x.topic}</span>
                    <span className={s.dim}>
                      {fmt(x.plays)} plays · strongest topic for {fmt(x.players)}
                    </span>
                  </div>
                  <div className={s.meter}>
                    <div style={{ width: `${(x.plays / segMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className={s.dim}>A player&apos;s strongest topic is the one where they beat the average score by the most, counting topics with 3 or more plays.</p>
        </section>
      </div>
    </>
  );
}

// ---- team ------------------------------------------------------------------

function Admins({ me, admins, onChange }: { me: string; admins: { id: string; username: string }[]; onChange: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = async (username: string, admin: boolean) => {
    if (!admin && !confirm(`Remove admin access from ${username}?`)) return;
    setErr("");
    setBusy(true);
    try {
      await api("/api/admin/admins", { username, admin });
      setName("");
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={s.panel}>
      <div className={s.head}>
        <h2>Admins</h2>
        <span className={s.dim}>{admins.length}</span>
      </div>
      <ul className={s.rows}>
        {admins.map((a) => {
          const self = a.username.toLowerCase() === me.toLowerCase();
          return (
            <li className={s.rowItem} key={a.id}>
              <span>
                {a.username}
                {self && <span className={s.dim}> · you</span>}
              </span>
              {!self && (
                <button className={`${s.textBtn} ${s.danger}`} disabled={busy} onClick={() => void set(a.username, false)}>
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className={s.formRow}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void set(name.trim(), true);
        }}
      >
        <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Username" aria-label="Username to make an admin" />
        <button className={`${s.btn} ${s.primary}`} disabled={busy || !name.trim()}>
          Make admin
        </button>
      </form>
      {err && <div className={s.error}>{err}</div>}
    </section>
  );
}

// Sends a real email to your own address and shows what Resend answered.
function EmailCheck() {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async () => {
    setBusy(true);
    setOut(null);
    try {
      const r = await api<{ ok: boolean; to: string; detail: string }>("/api/admin/test-email", {});
      setOut({ ok: r.ok, text: r.ok ? `Sent to ${r.to}. ${r.detail}` : `Not sent to ${r.to}: ${r.detail}` });
    } catch (e) {
      setOut({ ok: false, text: e instanceof Error ? e.message : "Couldn't send that." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={s.panel}>
      <div className={s.head}>
        <h2>Email</h2>
      </div>
      <p className={s.dim} style={{ marginTop: 0 }}>
        Sends a test email to the address on your account, so you can check resets and confirmation links are getting through.
      </p>
      <button className={`${s.btn} ${s.primary}`} disabled={busy} onClick={() => void send()}>
        {busy ? "Sending…" : "Send test email"}
      </button>
      {out && (
        <div className={out.ok ? s.dim : s.error} role="status" style={{ marginTop: 10 }}>
          {out.text}
        </div>
      )}
    </section>
  );
}

function LogRows({ log }: { log: LogEntry[] }) {
  if (log.length === 0) return <div className={s.empty}>No admin changes yet.</div>;
  return (
    <ul className={s.rows}>
      {log.map((e, i) => (
        <li className={s.rowItem} key={`${e.at}-${i}`}>
          <div>
            <span className={s.name}>{e.actor}</span> <span className={s.dim}>{ACTIONS[e.action] ?? e.action}</span> {e.detail}
          </div>
          <span className={s.time}>{ago(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}

function Log({ log }: { log: LogEntry[] }) {
  return (
    <section className={s.panel}>
      <div className={s.head}>
        <h2>Activity</h2>
      </div>
      <LogRows log={log} />
    </section>
  );
}
