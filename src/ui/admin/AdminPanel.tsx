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
  const [synced, setSynced] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [, tick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [o, i, l, a] = await Promise.all([
        api<Overview>("/api/admin/overview"),
        api<{ suggestions: Idea[] }>("/api/admin/suggestions"),
        api<{ log: LogEntry[] }>("/api/admin/log"),
        api<{ admins: { id: string; username: string }[] }>("/api/admin/admins"),
      ]);
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

        <Stats overview={overview} />

        <div className={s.cols}>
          <div>
            <Ideas ideas={ideas} onChange={refresh} />
            <Missing />
          </div>
          <div>
            <Admins me={me} admins={admins} onChange={refresh} />
            <Log log={log} />
          </div>
        </div>
      </div>
    </div>
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
function Missing() {
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
                    <td>{r.n}×</td>
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
