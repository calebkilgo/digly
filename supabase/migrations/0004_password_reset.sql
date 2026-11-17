-- One-time password reset links. Only a hash of the token is stored.
create table if not exists public.password_resets (
  token_hash text primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_player on public.password_resets (player_id);
alter table public.password_resets enable row level security;
create index if not exists players_email_lower on public.players (lower(email));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.password_resets from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.password_resets to service_role;
  end if;
end $$;
