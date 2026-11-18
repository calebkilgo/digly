-- Admin panel: a status on each prompt idea (shared by all admins) and a log
-- of every admin action, so each admin sees what the others changed.
alter table public.prompt_suggestions add column if not exists status text not null default 'new';
alter table public.prompt_suggestions add column if not exists updated_by text;
alter table public.prompt_suggestions add column if not exists updated_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prompt_suggestions_status_check') then
    alter table public.prompt_suggestions add constraint prompt_suggestions_status_check
      check (status in ('new', 'planned', 'added', 'dismissed'));
  end if;
end $$;

create table if not exists public.admin_log (
  id bigserial primary key,
  actor text not null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists admin_log_created on public.admin_log (created_at desc);
alter table public.admin_log enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.admin_log from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.admin_log to service_role;
    grant usage, select on sequence public.admin_log_id_seq to service_role;
  end if;
end $$;
