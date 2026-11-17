-- Digly Unlimited: a one-time purchase that opens every past dig in the Vault.
alter table public.players add column if not exists unlimited boolean not null default false;
alter table public.players add column if not exists unlimited_at timestamptz;

-- One row per Stripe Checkout session. Written only by the Stripe webhook.
create table if not exists public.purchases (
  id text primary key,                 -- Stripe Checkout session id
  player_id uuid references public.players (id) on delete set null,
  product text not null,
  amount integer not null,             -- cents
  currency text not null,
  payment_intent text unique,
  status text not null check (status in ('paid', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchases_player on public.purchases (player_id);
alter table public.purchases enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.purchases from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.purchases to service_role;
  end if;
end $$;
