-- Prompt ideas players type in after a dig. Guests can send them too.
create table if not exists public.prompt_suggestions (
  id bigserial primary key,
  player_id uuid references public.players (id) on delete set null,
  text text not null check (char_length(text) between 2 and 120),
  day integer not null,
  created_at timestamptz not null default now()
);
create index if not exists prompt_suggestions_created on public.prompt_suggestions (created_at desc);
alter table public.prompt_suggestions enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.prompt_suggestions from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.prompt_suggestions to service_role;
    grant usage, select on sequence public.prompt_suggestions_id_seq to service_role;
  end if;
end $$;
