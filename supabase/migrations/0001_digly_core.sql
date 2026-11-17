-- Digly core tables. Only the server talks to these, with the service role key.
-- RLS is on with no policies, so the public anon key can read and write nothing.
-- Times are unix milliseconds (bigint) to match the game engine.

create table if not exists public.players (
  id uuid primary key,
  name text not null default '' check (char_length(name) <= 20),
  created_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id uuid primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  day integer not null check (day >= 1),
  level smallint not null check (level between 1 and 3),
  mode text not null check (mode in ('ranked', 'practice')),
  slug text not null,
  started_at bigint not null,
  expires_at bigint not null,
  finished_at bigint,
  score integer,
  points integer,
  unique_count integer not null default 0,
  submissions integer not null default 0,
  created_at timestamptz not null default now()
);

-- one ranked attempt per player, day and level
create unique index if not exists attempts_ranked_once
  on public.attempts (player_id, day, level) where mode = 'ranked';
create index if not exists attempts_player_day on public.attempts (player_id, day);
create index if not exists attempts_board on public.attempts (day) where mode = 'ranked' and finished_at is not null;

create table if not exists public.attempt_answers (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  answer_id text not null,
  seq bigint generated always as identity,
  primary key (attempt_id, answer_id)
);

create table if not exists public.attempt_rejects (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  text text not null check (char_length(text) <= 60),
  seq bigint generated always as identity,
  primary key (attempt_id, text)
);

-- atomic counter so two fast submissions can't both slip under the cap
create or replace function public.digly_bump_submissions(p_id uuid)
returns integer language sql as $$
  update public.attempts set submissions = submissions + 1 where id = p_id returning submissions;
$$;

-- finishes an attempt once; returns false if it was already finished
create or replace function public.digly_finish_attempt(
  p_id uuid, p_finished_at bigint, p_score integer, p_points integer, p_unique integer
) returns boolean language plpgsql as $$
begin
  update public.attempts
     set finished_at = p_finished_at, score = p_score, points = p_points, unique_count = p_unique
   where id = p_id and finished_at is null;
  return found;
end;
$$;

create or replace function public.digly_day_board(p_day integer, p_limit integer default 100)
returns table (player_id uuid, name text, points bigint, uniq bigint) language sql stable as $$
  select a.player_id, p.name, sum(a.points)::bigint, sum(a.unique_count)::bigint
    from public.attempts a
    join public.players p on p.id = a.player_id
   where a.day = p_day and a.mode = 'ranked' and a.finished_at is not null
   group by a.player_id, p.name
   order by 3 desc, 4 desc
   limit least(p_limit, 500);
$$;

alter table public.players enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.attempt_rejects enable row level security;

-- Supabase grants these roles access by default; take it back.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.players, public.attempts, public.attempt_answers, public.attempt_rejects from anon, authenticated;
    revoke execute on function public.digly_bump_submissions(uuid) from anon, authenticated, public;
    revoke execute on function public.digly_finish_attempt(uuid, bigint, integer, integer, integer) from anon, authenticated, public;
    revoke execute on function public.digly_day_board(integer, integer) from anon, authenticated, public;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.players, public.attempts, public.attempt_answers, public.attempt_rejects to service_role;
    grant execute on function public.digly_bump_submissions(uuid) to service_role;
    grant execute on function public.digly_finish_attempt(uuid, bigint, integer, integer, integer) to service_role;
    grant execute on function public.digly_day_board(integer, integer) to service_role;
  end if;
end $$;
