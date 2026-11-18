-- The admin panel's live view reads the last hour of attempts every few seconds.
create index if not exists attempts_started on public.attempts (started_at desc);
