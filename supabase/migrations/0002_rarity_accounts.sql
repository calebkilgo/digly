-- Real rarity stats, reject review, and accounts.
-- Safe to run more than once.

-- Accounts live on the player row: a guest becomes an account by picking a
-- username and password. Usernames are unique ignoring case.
alter table public.players add column if not exists username text;
alter table public.players add column if not exists password_hash text;
alter table public.players add column if not exists email text;
alter table public.players add column if not exists account_created_at timestamptz;
create unique index if not exists players_username_lower on public.players (lower(username));

-- Login sessions. Only a hash of the token is stored.
create table if not exists public.sessions (
  token_hash text primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_player on public.sessions (player_id);
alter table public.sessions enable row level security;

create index if not exists attempts_slug_day on public.attempts (slug, day) where mode = 'ranked';

-- Ranked plays of a category before a day, and how many found each answer.
create or replace function public.digly_answer_stats(p_slug text, p_before_day integer)
returns jsonb language sql stable as $$
  with a as (
    select id from public.attempts
     where slug = p_slug and mode = 'ranked' and day < p_before_day
  )
  select jsonb_build_object(
    'plays', (select count(*) from a),
    'counts', coalesce((
      select jsonb_object_agg(answer_id, n) from (
        select aa.answer_id, count(*) as n
          from public.attempt_answers aa join a on a.id = aa.attempt_id
         group by aa.answer_id
      ) c
    ), '{}'::jsonb)
  );
$$;

-- Most common inputs that didn't match a category, for growing its answer list.
create or replace function public.digly_top_rejects(p_slug text, p_limit integer default 100)
returns table (text text, n bigint) language sql stable as $$
  select lower(r.text), count(*)
    from public.attempt_rejects r
    join public.attempts a on a.id = r.attempt_id
   where a.slug = p_slug
   group by lower(r.text)
   order by 2 desc, 1
   limit least(p_limit, 1000);
$$;

-- The board only shows accounts. Guests see their own score but it isn't posted.
create or replace function public.digly_day_board(p_day integer, p_limit integer default 100)
returns table (player_id uuid, name text, points bigint, uniq bigint) language sql stable as $$
  select a.player_id, p.username, sum(a.points)::bigint, sum(a.unique_count)::bigint
    from public.attempts a
    join public.players p on p.id = a.player_id
   where a.day = p_day and a.mode = 'ranked' and a.finished_at is not null and p.username is not null
   group by a.player_id, p.username
   order by 3 desc, 4 desc
   limit least(p_limit, 500);
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.sessions from anon, authenticated;
    revoke execute on function public.digly_answer_stats(text, integer) from anon, authenticated, public;
    revoke execute on function public.digly_top_rejects(text, integer) from anon, authenticated, public;
    revoke execute on function public.digly_day_board(integer, integer) from anon, authenticated, public;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.sessions to service_role;
    grant execute on function public.digly_answer_stats(text, integer) to service_role;
    grant execute on function public.digly_top_rejects(text, integer) to service_role;
    grant execute on function public.digly_day_board(integer, integer) to service_role;
  end if;
end $$;
