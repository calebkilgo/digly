-- Which version of the no-refund purchase terms each buyer agreed to, and when.
alter table public.purchases add column if not exists terms_version text;
alter table public.purchases add column if not exists terms_accepted_at timestamptz;
