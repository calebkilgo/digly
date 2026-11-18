"use client";

import { useCallback, useEffect, useState } from "react";
import "./admin.css";

// class names in admin.css are prefixed so they can't clash with the game's
const s = new Proxy({} as Record<string, string>, { get: (_, k) => `adm-${String(k)}` });

// The admin panel. Everything here is read from and written to the server,
// so every admin sees the same thing; it refreshes on its own every few
// seconds and right after any change.

type Status = "new" | "planned" | "added" | "dismissed";
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
const TIER_NAMES: Record<string, string> = { copper: "Bronze", gold: "Gold", diamond: "Diamond", ruby: "Ruby", platinum: "Platinum" };
interface Category {
  slug: string;
  title: string;
  level: number;
  vault: boolean;
}

const REFRESH_MS = 8000;
const STATUSES: Status[] = ["new", "planned", "added", "dismissed"];
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
  const s2 = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s2 < 60) return `${s2}s ago`;
  if (s2 < 3600) return `${Math.round(s2 / 60)}m ago`;
  if (s2 < 86400) return `${Math.round(s2 / 3600)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AdminPanel({ me }: { me: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [admins, setAdmins] = useState<{ id: string; username: string }[]>([]);
  const [live, setLive] = useState<LiveStats | null>(null);
  const [synced, setSynced] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [, tick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [o, i, l, a, lv] = await Promise.all([
        api<Overview>("/api/admin/overview"),
        api<{ suggestions: Idea[] }>("/api/admin/suggestions"),
        api<{ log: LogEntry[] }>("/api/admin/log"),
        api<{ admins: { id: string; username: string }[] }>("/api/admin/admins"),
        api<LiveStats>("/api/admin/live"),
      ]);
      setLive(lv);
      setOverview(o);
      setIdeas(i.suggestions);
      setLog(l.log);
      setAdmins(a.admins);
      setSynced(Date.now());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      clearInterval(id);
      clearInterval(clock);
    };
  }, [refresh]);

  return (
    <div className={s.root}>
      <div className={s.wrap}>
        <header className={s.top}>
          <div className={s.brand}>
            Digly <span>admin</span>
          </div>
          <div className={s.meta}>
            <span>
              <span className={`${s.dot} ${offline ? s.dotOff : ""}`} />
              {offline ? "Can't reach the server" : synced ? `Live · synced ${ago(synced)}` : "Loading…"}
            </span>
            <span>Signed in as {me}</span>
            <a className={s.link} href="/">
              Back to the game
            </a>
          </div>
        </header>

        <Live live={live} />
        <Stats overview={overview} />

        <div className={s.cols}>
          <div>
            <Ideas ideas={ideas} onChange={refresh} />
            <Missing onAdd={refresh} />
          </div>
          <div>
            <Admins me={me} admins={admins} onChange={refresh} />
            <Log log={log} />
          </div>
        </div>

        <Answers synced={synced} onChange={refresh} />
      </div>
    </div>
  );
}

// Who's playing right now: everyone with a level still on the clock, plus how
// many started a level recently. Refreshes with the rest of the panel.
function Live({ live }: { live: LiveStats | null }) {
  const max = Math.max(1, ...(live?.buckets ?? [0]));
  return (
    <section className={`${s.section} ${s.live}`}>
      <div className={s.liveMain}>
        <div className={s.label}>
          <span className={`${s.dot} ${s.pulse}`} /> Digging right now
        </div>
        <div className={s.liveBig}>{live ? live.diggingNow.toLocaleString() : "—"}</div>
        {live && (
          <div className={s.small}>
            {live.ranked} daily · {live.practice} practice · {live.vault} Vault
            <br />
            Level 1: {live.byLevel[0]} · Level 2: {live.byLevel[1]} · Level 3: {live.byLevel[2]}
          </div>
        )}
      </div>
      <div className={s.liveSide}>
        <div className={s.liveRow}>
          {(
            [
              ["Last 5 min", live?.last5],
              ["Last 15 min", live?.last15],
              ["Last hour", live?.lastHour],
            ] as const
          ).map(([label, v]) => (
            <div key={label}>
              <div className={s.label}>{label}</div>
              <div className={s.stat}>{v === undefined ? "—" : v.toLocaleString()}</div>
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
        <div className={`${s.small} ${s.barAxis}`}>
          <span>1 hour ago</span>
          <span>now</span>
        </div>
      </div>
    </section>
  );
}

function Stats({ overview }: { overview: Overview | null }) {
  const st = overview?.stats;
  const cards: [string, number | string | undefined][] = [
    ["Players", st?.players],
    ["Accounts", st?.accounts],
    ["Unlimited", st?.unlimited],
    ["Dug today", st?.diggersToday],
    ["Finished today", st?.finishedToday],
  ];
  return (
    <>
      <div className={s.grid}>
        {cards.map(([label, v]) => (
          <div className={s.card} key={label}>
            <div className={s.label}>{label}</div>
            <div className={s.stat}>{v === undefined ? "—" : v.toLocaleString()}</div>
          </div>
        ))}
      </div>
      {overview && (
        <div className={s.section}>
          <h2>
            Today · Daily Dig {overview.number}
            <span className={s.pill}>{overview.backend === "supabase" ? "Supabase" : "Memory store (not shared)"}</span>
          </h2>
          <div className={s.small}>{overview.categories.map((c) => `Level ${c.level}: ${c.title}`).join("   ·   ")}</div>
        </div>
      )}
    </>
  );
}

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
    <section className={s.section}>
      <h2>
        Prompt ideas <span className={s.small}>{ideas.length} total</span>
      </h2>
      <div className={s.tabs}>
        {[...STATUSES, "all" as const].map((st) => (
          <button key={st} className={`${s.tab} ${filter === st ? s.tabOn : ""}`} onClick={() => setFilter(st)}>
            {st[0].toUpperCase() + st.slice(1)}
            {st !== "all" ? ` (${count(st)})` : ""}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className={s.small}>Nothing here.</div>
      ) : (
        <ul className={s.list}>
          {shown.map((i) => (
            <li className={s.row} key={i.id}>
              <div>
                <div>{i.text}</div>
                <div className={s.small}>
                  sent {ago(i.createdAt)}
                  {i.updatedBy ? ` · ${i.status} by ${i.updatedBy} ${i.updatedAt ? ago(i.updatedAt) : ""}` : ""}
                </div>
              </div>
              <select className={s.select} value={i.status} onChange={(e) => void setStatus(i.id, e.target.value as Status)} aria-label={`Status for ${i.text}`}>
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      {err && <div className={s.error}>{err}</div>}
    </section>
  );
}

// The most common things players typed that didn't count, per category.
// Real answers that show up here belong in the answer lists.
function Missing({ onAdd }: { onAdd: () => Promise<void> }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [slug, setSlug] = useState("");
  const [data, setData] = useState<{ plays: number; answersInList: number; rejects: { text: string; n: number }[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ categories: Category[] }>("/api/admin/rejects").then(
      (r) => setCats(r.categories),
      () => setErr("Couldn't load categories."),
    );
  }, []);

  useEffect(() => {
    if (!slug) return;
    setData(null);
    api<{ plays: number; answersInList: number; rejects: { text: string; n: number }[] }>(`/api/admin/rejects?slug=${encodeURIComponent(slug)}`).then(setData, () =>
      setErr("Couldn't load that category."),
    );
  }, [slug]);

  return (
    <section className={s.section}>
      <h2>Missing answers</h2>
      <select className={s.select} value={slug} onChange={(e) => setSlug(e.target.value)} style={{ width: "100%" }}>
        <option value="">Pick a category…</option>
        {cats.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.vault ? "Vault · " : ""}L{c.level} · {c.title}
          </option>
        ))}
      </select>
      {data && (
        <>
          <div className={s.small} style={{ margin: "10px 0" }}>
            {data.answersInList} answers in the list · {data.plays} ranked plays
          </div>
          {data.rejects.length === 0 ? (
            <div className={s.small}>No rejected answers yet.</div>
          ) : (
            <table className={s.table}>
              <tbody>
                {data.rejects.slice(0, 60).map((r) => (
                  <tr key={r.text}>
                    <td>{r.text}</td>
                    <td>
                      {r.n}×{" "}
                      <button
                        className={`${s.btn} ${s.ghost}`}
                        onClick={async () => {
                          const name = prompt(`Add to ${cats.find((c) => c.slug === slug)?.title ?? slug} as:`, r.text);
                          if (!name?.trim()) return;
                          setErr("");
                          try {
                            await api("/api/admin/answers", { slug, action: "add", name: name.trim(), aliases: name.trim().toLowerCase() === r.text ? [] : [r.text], rating: 75 });
                            setData({ ...data, answersInList: data.answersInList + 1, rejects: data.rejects.filter((x) => x.text !== r.text) });
                            await onAdd();
                          } catch (e) {
                            setErr(e instanceof Error ? e.message : "Couldn't add that.");
                          }
                        }}
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {err && <div className={s.error}>{err}</div>}
    </section>
  );
}

// Every category's answer list: search it, add answers, change or remove them.
// Changes live in the database, so the game and the other admins pick them up
// within about 30 seconds, no redeploy needed.
function Answers({ synced, onChange }: { synced: number | null; onChange: () => Promise<void> }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [slug, setSlug] = useState("");
  const [list, setList] = useState<AnswerList | null>(null);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "edited" | "removed">("all");
  const [form, setForm] = useState({ name: "", aliases: "", rating: "75" });
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ categories: Category[] }>("/api/admin/rejects").then(
      (r) => setCats(r.categories),
      () => setErr("Couldn't load categories."),
    );
  }, []);

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
    setEditing(null);
    setForm({ name: "", aliases: "", rating: "75" });
    void load(slug);
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

  const save = async () => {
    const name = form.name.trim();
    if (!name) return;
    const aliases = form.aliases.split(",").map((a) => a.trim()).filter(Boolean);
    const ok = await send({ action: "add", name, aliases, rating: Number(form.rating), ...(editing ? { replaces: editing } : {}) });
    if (ok) {
      setForm({ name: "", aliases: "", rating: "75" });
      setEditing(null);
    }
  };

  const needle = q.trim().toLowerCase();
  const rows = (list?.answers ?? []).filter((a) => {
    if (show === "edited" && (a.status === "list" || a.status === "removed")) return false;
    if (show === "removed" && a.status !== "removed") return false;
    if (!needle) return true;
    return a.name.toLowerCase().includes(needle) || a.aliases.some((x) => x.includes(needle));
  });
  const edited = (list?.answers ?? []).filter((a) => a.status === "added" || a.status === "changed").length;
  const removed = (list?.answers ?? []).filter((a) => a.status === "removed").length;
  const exact = needle && list?.answers.some((a) => a.status !== "removed" && (a.name.toLowerCase() === needle || a.aliases.includes(needle)));

  return (
    <section className={s.section}>
      <h2>
        Answer lists
        {list && (
          <span className={s.small}>
            {list.count} answers · {edited} added or changed · {removed} removed
          </span>
        )}
      </h2>
      <select className={s.select} value={slug} onChange={(e) => setSlug(e.target.value)} style={{ width: "100%" }}>
        <option value="">Pick a category…</option>
        {cats.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.vault ? "Vault · " : ""}L{c.level} · {c.title}
          </option>
        ))}
      </select>

      {slug && !list && !err && <div className={s.small} style={{ marginTop: 10 }}>Loading…</div>}

      {list && (
        <>
          <form
            className={s.form}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input className={s.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Answer, e.g. White Oak" aria-label="Answer" />
            <input
              className={s.input}
              value={form.aliases}
              onChange={(e) => setForm({ ...form, aliases: e.target.value })}
              placeholder="Other spellings, comma separated"
              aria-label="Other spellings"
            />
            <input
              className={s.input}
              style={{ flex: "0 0 64px" }}
              type="number"
              min={1}
              max={100}
              value={form.rating}
              onChange={(e) => setForm({ ...form, rating: e.target.value })}
              title="Rarity: 1 is the most common, 100 the rarest"
              aria-label="Rarity 1 to 100"
            />
            <button className={s.btn} disabled={busy || !form.name.trim()}>
              {editing ? "Save" : "Add"}
            </button>
            {editing && (
              <button
                type="button"
                className={`${s.btn} ${s.ghost}`}
                onClick={() => {
                  setEditing(null);
                  setForm({ name: "", aliases: "", rating: "75" });
                }}
              >
                Cancel
              </button>
            )}
          </form>
          <div className={s.small} style={{ marginBottom: 10 }}>
            Rarity is 1 for answers almost everyone gives up to 100 for ones almost nobody does. Live play adjusts it over time.
          </div>

          <div className={s.form}>
            <input className={s.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search answers and spellings" aria-label="Search answers" />
          </div>
          <div className={s.tabs}>
            {(["all", "edited", "removed"] as const).map((t) => (
              <button key={t} className={`${s.tab} ${show === t ? s.tabOn : ""}`} onClick={() => setShow(t)}>
                {t === "all" ? "All" : t === "edited" ? `Added or changed (${edited})` : `Removed (${removed})`}
              </button>
            ))}
          </div>
          {needle && !exact && (
            <div className={s.small} style={{ marginBottom: 8 }}>
              &ldquo;{q.trim()}&rdquo; doesn&apos;t count yet.{" "}
              <button className={`${s.btn} ${s.ghost}`} onClick={() => setForm({ name: q.trim(), aliases: "", rating: "75" })}>
                Fill it in above
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <div className={s.small}>No matches.</div>
          ) : (
            <table className={`${s.table} ${s.answers}`}>
              <tbody>
                {rows.slice(0, 400).map((a) => (
                  <tr key={`${a.status}-${a.key}`} className={a.status === "removed" ? s.gone : ""}>
                    <td>
                      {a.name}
                      {a.status !== "list" && <span className={s.pill}>{a.status}{a.by ? ` by ${a.by}` : ""}</span>}
                      {a.aliases.length > 0 && <div className={s.small}>{a.aliases.join(", ")}</div>}
                    </td>
                    <td className={s.num}>{a.rating}</td>
                    <td className={s.num}>{a.status === "removed" ? "" : TIER_NAMES[a.tier] ?? a.tier}</td>
                    <td>
                      {a.status === "removed" ? (
                        <button className={`${s.btn} ${s.ghost}`} disabled={busy} onClick={() => void send({ action: "undo", key: a.key, name: a.name })}>
                          Put back
                        </button>
                      ) : (
                        <>
                          <button
                            className={`${s.btn} ${s.ghost}`}
                            disabled={busy}
                            onClick={() => {
                              setEditing(a.key);
                              setForm({ name: a.name, aliases: a.aliases.join(", "), rating: String(a.rating) });
                            }}
                          >
                            Edit
                          </button>{" "}
                          {a.status !== "list" && (
                            <>
                              <button className={`${s.btn} ${s.ghost}`} disabled={busy} title="Go back to how the code has it" onClick={() => void send({ action: "undo", key: a.key, name: a.name })}>
                                Undo
                              </button>{" "}
                            </>
                          )}
                          {a.status !== "added" && (
                            <button
                              className={`${s.btn} ${s.ghost}`}
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
          {rows.length > 400 && <div className={s.small}>Showing 400 of {rows.length}. Search to narrow it down.</div>}
        </>
      )}
      {err && <div className={s.error}>{err}</div>}
    </section>
  );
}

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
    <section className={s.section}>
      <h2>Admins</h2>
      <ul className={s.list}>
        {admins.map((a) => (
          <li className={s.row} key={a.id}>
            <span>
              {a.username}
              {a.username.toLowerCase() === me.toLowerCase() ? <span className={s.small}> (you)</span> : null}
            </span>
            {a.username.toLowerCase() !== me.toLowerCase() && (
              <button className={`${s.btn} ${s.ghost}`} disabled={busy} onClick={() => void set(a.username, false)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void set(name.trim(), true);
        }}
      >
        <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Username to make an admin" />
        <button className={s.btn} disabled={busy || !name.trim()}>
          Add
        </button>
      </form>
      {err && <div className={s.error}>{err}</div>}
    </section>
  );
}

function Log({ log }: { log: LogEntry[] }) {
  return (
    <section className={s.section}>
      <h2>Activity</h2>
      {log.length === 0 ? (
        <div className={s.small}>No admin changes yet.</div>
      ) : (
        <ul className={s.list}>
          {log.map((e, i) => (
            <li className={s.row} key={`${e.at}-${i}`}>
              <div>
                <b>{e.actor}</b> {ACTIONS[e.action] ?? e.action} {e.detail}
              </div>
              <span className={s.small}>{ago(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
