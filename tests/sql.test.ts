import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const SQL = readFileSync(new URL("../supabase/migrations/0001_digly_core.sql", import.meta.url), "utf8");
const P = "11111111-1111-4111-8111-111111111111";
const Q = "22222222-2222-4222-8222-222222222222";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("supabase migration", () => {
  it("applies twice and enforces the game rules in the database", async () => {
    const db = new PGlite();
    await db.exec(SQL);
    await db.exec(SQL); // idempotent

    await db.query("insert into players (id, name) values ($1, 'Rocky'), ($2, '')", [P, Q]);
    const ins = "insert into attempts (id, player_id, day, level, mode, slug, started_at, expires_at) values ($1,$2,29,1,$3,'dog-breeds',0,60000)";
    await db.query(ins, [A, P, "ranked"]);
    // a second ranked level 1 for the same day is refused, practice is fine
    await expect(db.query(ins, ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", P, "ranked"])).rejects.toMatchObject({ code: "23505" });
    await db.query(ins, ["cccccccc-cccc-4ccc-8ccc-cccccccccccc", P, "practice"]);

    await db.query("insert into attempt_answers (attempt_id, answer_id) values ($1, 'd1'), ($1, 'd9')", [A]);
    await expect(db.query("insert into attempt_answers (attempt_id, answer_id) values ($1, 'd1')", [A])).rejects.toMatchObject({ code: "23505" });

    const bump = await db.query<{ digly_bump_submissions: number }>("select digly_bump_submissions($1)", [A]);
    expect(bump.rows[0].digly_bump_submissions).toBe(1);

    const f1 = await db.query<{ digly_finish_attempt: boolean }>("select digly_finish_attempt($1, 30000, 150, 150, 2)", [A]);
    const f2 = await db.query<{ digly_finish_attempt: boolean }>("select digly_finish_attempt($1, 31000, 999, 999, 9)", [A]);
    expect(f1.rows[0].digly_finish_attempt).toBe(true);
    expect(f2.rows[0].digly_finish_attempt).toBe(false);

    const board = await db.query<{ player_id: string; name: string; points: number; uniq: number }>("select * from digly_day_board(29, 10)");
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0]).toMatchObject({ player_id: P, name: "Rocky" });
    expect(Number(board.rows[0].points)).toBe(150);
  });
});

const SQL2 = readFileSync(new URL("../supabase/migrations/0002_rarity_accounts.sql", import.meta.url), "utf8");

describe("migration 0002", () => {
  it("adds accounts, sessions, answer stats and reject review", async () => {
    const db = new PGlite();
    await db.exec(SQL);
    await db.exec(SQL2);
    await db.exec(SQL2);
    await db.query("insert into players (id) values ($1), ($2)", [P, Q]);
    await db.query("update players set username = 'Rocky', password_hash = 'h' where id = $1", [P]);
    await expect(db.query("update players set username = 'rocky' where id = $1", [Q])).rejects.toMatchObject({ code: "23505" });

    const ins = "insert into attempts (id, player_id, day, level, mode, slug, started_at, expires_at, finished_at, points, unique_count) values ($1,$2,$3,1,'ranked','dog-breeds',0,1,1,$4,1)";
    await db.query(ins, [A, P, 5, 50]);
    await db.query(ins, ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", Q, 5, 70]);
    await db.query(ins, ["cccccccc-cccc-4ccc-8ccc-cccccccccccc", Q, 9, 10]);
    await db.query("insert into attempt_answers (attempt_id, answer_id) values ($1,'d:pug'), ($1,'d:mudi'), ($2,'d:pug')", [A, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]);
    await db.query("insert into attempt_rejects (attempt_id, text) values ($1,'Kooiker'), ($2,'kooiker')", [A, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]);

    const stats = await db.query<{ s: { plays: number; counts: Record<string, number> } }>("select digly_answer_stats('dog-breeds', 9) as s");
    expect(stats.rows[0].s).toEqual({ plays: 2, counts: { "d:pug": 2, "d:mudi": 1 } });
    const none = await db.query<{ s: { plays: number } }>("select digly_answer_stats('dog-breeds', 5) as s");
    expect(none.rows[0].s).toEqual({ plays: 0, counts: {} });

    const rej = await db.query<{ text: string; n: number }>("select * from digly_top_rejects('dog-breeds', 10)");
    expect(rej.rows.map((r) => [r.text, Number(r.n)])).toEqual([["kooiker", 2]]);

    // guests (no username) stay off the board
    const board = await db.query<{ name: string }>("select * from digly_day_board(5, 10)");
    expect(board.rows.map((r) => r.name)).toEqual(["Rocky"]);

    await db.query("insert into sessions (token_hash, player_id, expires_at) values ('abc', $1, now() + interval '1 day')", [P]);
  });
});

describe("migration 0003", () => {
  it("adds an admin flag that defaults to off", async () => {
    const db = new PGlite();
    await db.exec(SQL);
    await db.exec(SQL2);
    await db.exec(readFileSync(new URL("../supabase/migrations/0003_admin.sql", import.meta.url), "utf8"));
    await db.query("insert into players (id, username) values ($1, 'calebk'), ($2, 'other')", [P, Q]);
    await db.query("update public.players set is_admin = true where lower(username) = lower('CalebK')");
    const r = await db.query<{ username: string; is_admin: boolean }>("select username, is_admin from players order by username");
    expect(r.rows).toEqual([{ username: "calebk", is_admin: true }, { username: "other", is_admin: false }]);
  });
});

describe("migration 0004", () => {
  it("adds single-use reset links that go away with the player", async () => {
    const db = new PGlite();
    await db.exec(SQL);
    await db.exec(SQL2);
    const SQL4 = readFileSync(new URL("../supabase/migrations/0004_password_reset.sql", import.meta.url), "utf8");
    await db.exec(SQL4);
    await db.exec(SQL4);
    await db.query("insert into players (id, username, email) values ($1, 'Rocky', 'r@x.io')", [P]);
    await db.query("insert into password_resets (token_hash, player_id, expires_at) values ('t', $1, now() + interval '1 hour')", [P]);
    const del = await db.query<{ player_id: string }>("delete from password_resets where token_hash = 't' returning player_id");
    expect(del.rows).toEqual([{ player_id: P }]);
    const again = await db.query("delete from password_resets where token_hash = 't' returning player_id");
    expect(again.rows).toEqual([]);
    await db.query("insert into password_resets (token_hash, player_id, expires_at) values ('u', $1, now())", [P]);
    await db.query("insert into sessions (token_hash, player_id, expires_at) values ('s', $1, now())", [P]);
    await db.query("delete from players where id = $1", [P]);
    const left = await db.query<{ n: number }>("select (select count(*) from password_resets) + (select count(*) from sessions) as n");
    expect(Number(left.rows[0].n)).toBe(0);
  });
});

describe("migration 0005", () => {
  it("adds Unlimited and a purchases table that outlives deleted accounts", async () => {
    const db = new PGlite();
    await db.exec(SQL);
    const SQL5 = readFileSync(new URL("../supabase/migrations/0005_unlimited.sql", import.meta.url), "utf8");
    await db.exec(SQL5);
    await db.exec(SQL5);
    await db.query("insert into players (id) values ($1)", [P]);
    expect((await db.query<{ unlimited: boolean }>("select unlimited from players")).rows[0].unlimited).toBe(false);
    const up = "insert into purchases (id, player_id, product, amount, currency, payment_intent, status) values ('cs_1', $1, 'unlimited', 500, 'usd', 'pi_1', 'paid') on conflict (id) do update set status = excluded.status";
    await db.query(up, [P]);
    await db.query(up, [P]);
    expect(Number((await db.query<{ n: number }>("select count(*) as n from purchases")).rows[0].n)).toBe(1);
    await expect(db.query("insert into purchases (id, product, amount, currency, status) values ('cs_2', 'unlimited', 500, 'usd', 'gift')")).rejects.toBeTruthy();
    await db.query("delete from players where id = $1", [P]);
    const left = await db.query<{ player_id: string | null }>("select player_id from purchases");
    expect(left.rows).toEqual([{ player_id: null }]);
  });
});

describe("migration 0006", () => {
  it("stores prompt ideas, keeps them when the player is deleted, and checks length", async () => {
    const db = new PGlite();
    await db.exec(SQL);
    const SQL6 = readFileSync(new URL("../supabase/migrations/0006_prompt_suggestions.sql", import.meta.url), "utf8");
    await db.exec(SQL6);
    await db.exec(SQL6);
    await db.query("insert into players (id) values ($1)", [P]);
    await db.query("insert into prompt_suggestions (player_id, text, day) values ($1, 'Board games', 31)", [P]);
    await db.query("insert into prompt_suggestions (player_id, text, day) values (null, 'Kinds of cheese', 31)");
    await expect(db.query("insert into prompt_suggestions (text, day) values ('x', 31)")).rejects.toBeTruthy();
    await db.query("delete from players where id = $1", [P]);
    const rows = await db.query<{ player_id: string | null }>("select player_id from prompt_suggestions order by id");
    expect(rows.rows).toEqual([{ player_id: null }, { player_id: null }]);
  });
});

describe("migration 0007", () => {
  it("adds idea statuses and an admin log", async () => {
    const db = new PGlite();
    await db.exec(SQL);
    await db.exec(readFileSync(new URL("../supabase/migrations/0006_prompt_suggestions.sql", import.meta.url), "utf8"));
    const SQL7 = readFileSync(new URL("../supabase/migrations/0007_admin_panel.sql", import.meta.url), "utf8");
    await db.exec(SQL7);
    await db.exec(SQL7);
    await db.query("insert into prompt_suggestions (text, day) values ('Kinds of cheese', 31)");
    expect((await db.query<{ status: string }>("select status from prompt_suggestions")).rows[0].status).toBe("new");
    await db.query("update prompt_suggestions set status = 'planned', updated_by = 'caleb', updated_at = now()");
    await expect(db.query("update prompt_suggestions set status = 'nope'")).rejects.toBeTruthy();
    await db.query("insert into admin_log (actor, action, detail) values ('caleb', 'idea_planned', 'Kinds of cheese')");
    expect(Number((await db.query<{ n: number }>("select count(*) as n from admin_log")).rows[0].n)).toBe(1);
  });
});
