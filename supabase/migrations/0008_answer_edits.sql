-- Admin edits to the answer lists. Each row adds (or changes) one answer, or
-- removes one, on top of the list that ships in the code. Deleting a row undoes it.
create table if not exists public.answer_edits (
  slug text not null,
  key text not null,
  action text not null check (action in ('add', 'remove')),
  name text not null,
  aliases text[] not null default '{}',
  rating int not null default 75 check (rating between 1 and 100),
  actor text not null,
  updated_at timestamptz not null default now(),
  primary key (slug, key)
);
alter table public.answer_edits enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.answer_edits from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.answer_edits to service_role;
  end if;
end $$;
