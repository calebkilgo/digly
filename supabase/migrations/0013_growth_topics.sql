-- Admin numbers straight from the database: players per day, new players,
-- next-day and next-week returns, and which topics players are strongest in.
-- Safe to run more than once. The admin panel says so if this hasn't been run.

-- A player's activity day is the game day (00:00 UTC) when they started an
-- attempt, counted from p_launch_ms like the game's own day numbers.
create or replace function public.digly_growth(p_launch_ms bigint, p_from integer, p_to integer)
returns table (
  day integer,
  players integer,
  new_players integer,
  accounts integer,
  ranked_started integer,
  ranked_finished integer,
  back_d1 integer,
  back_d7 integer
) language sql stable as $$
  with act as (
    select distinct a.player_id, (floor((a.started_at - p_launch_ms) / 86400000.0) + 1)::integer as d
    from public.attempts a
  ),
  firsts as (
    select player_id, min(d) as d0 from act group by player_id
  ),
  days as (
    select generate_series(p_from, p_to) as day
  )
  select
    days.day,
    (select count(*) from act where act.d = days.day)::integer,
    (select count(*) from firsts f where f.d0 = days.day)::integer,
    (select count(*) from public.players p
      where p.account_created_at >= to_timestamp((p_launch_ms + (days.day - 1)::bigint * 86400000) / 1000.0)
        and p.account_created_at < to_timestamp((p_launch_ms + days.day::bigint * 86400000) / 1000.0))::integer,
    (select count(*) from public.attempts a where a.day = days.day and a.mode = 'ranked' and a.level = 1)::integer,
    (select count(*) from public.attempts a where a.day = days.day and a.mode = 'ranked' and a.level = 3 and a.finished_at is not null)::integer,
    (select count(*) from firsts f join act on act.player_id = f.player_id and act.d = f.d0 + 1 where f.d0 = days.day)::integer,
    (select count(*) from firsts f join act on act.player_id = f.player_id and act.d = f.d0 + 7 where f.d0 = days.day)::integer
  from days
  order by days.day;
$$;

-- Average points per prompt and level, the yardstick for topic strength.
create or replace function public.digly_prompt_baselines()
returns table (slug text, level smallint, avg_points double precision, plays integer)
language sql stable as $$
  select a.slug, a.level, avg(a.points)::double precision, count(*)::integer
  from public.attempts a
  where a.finished_at is not null and a.points is not null
  group by a.slug, a.level;
$$;

-- Plays per topic, and how many players are strongest in each one. A player's
-- strength in a topic is their average points there divided by everyone's
-- average on the same prompts; only topics with p_min_plays plays count.
-- p_topics maps prompt slug -> topic name.
create or replace function public.digly_topic_segments(p_topics jsonb, p_min_plays integer)
returns table (topic text, players integer, plays integer)
language sql stable as $$
  with fin as (
    select a.player_id, a.slug, a.level, a.points
    from public.attempts a
    where a.finished_at is not null and a.points is not null
  ),
  base as (
    select slug, level, avg(points)::double precision as avg_points
    from fin group by slug, level having avg(points) > 0
  ),
  scored as (
    select f.player_id, coalesce(p_topics ->> f.slug, 'other') as topic, f.points / b.avg_points as ratio
    from fin f join base b on b.slug = f.slug and b.level = f.level
  ),
  per as (
    select player_id, topic, count(*) as n, avg(ratio) as r from scored group by player_id, topic
  ),
  best as (
    select distinct on (player_id) player_id, topic
    from per where n >= p_min_plays
    order by player_id, r desc, topic
  )
  select t.topic, coalesce(b.players, 0)::integer, t.plays::integer
  from (select topic, sum(n) as plays from per group by topic) t
  left join (select topic, count(*) as players from best group by topic) b on b.topic = t.topic
  order by t.plays desc, t.topic;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.digly_growth(bigint, integer, integer) from anon, authenticated, public;
    revoke execute on function public.digly_prompt_baselines() from anon, authenticated, public;
    revoke execute on function public.digly_topic_segments(jsonb, integer) from anon, authenticated, public;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.digly_growth(bigint, integer, integer) to service_role;
    grant execute on function public.digly_prompt_baselines() to service_role;
    grant execute on function public.digly_topic_segments(jsonb, integer) to service_role;
  end if;
end $$;
