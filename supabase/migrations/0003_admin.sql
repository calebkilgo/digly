-- Admin flag for testing tools (reset your own dig). Set it by hand:
--   update public.players set is_admin = true where lower(username) = lower('YOUR_USERNAME');
alter table public.players add column if not exists is_admin boolean not null default false;
