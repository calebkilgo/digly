-- Google sign-in, email verification and the marketing email opt-in.
-- Safe to run more than once.
alter table public.players add column if not exists google_sub text;
create unique index if not exists players_google_sub on public.players (google_sub) where google_sub is not null;
alter table public.players add column if not exists email_verified_at timestamptz;
alter table public.players add column if not exists marketing_opt_in boolean not null default false;
alter table public.players add column if not exists marketing_opt_in_at timestamptz;

-- One-time links that confirm an email address. Only a hash of the token is stored.
create table if not exists public.email_verifications (
  token_hash text primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists email_verifications_player on public.email_verifications (player_id);
alter table public.email_verifications enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.email_verifications from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.email_verifications to service_role;
  end if;
end $$;
