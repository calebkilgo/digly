-- One database trip per guess instead of three. Checks the attempt is this
-- player's and still open, counts the submission against the cap, then records
-- the answer or the miss. Safe to run more than once. The app falls back to the
-- old three-step path until this is run.
create or replace function public.digly_submit(
  p_id uuid, p_player uuid, p_now bigint, p_grace integer, p_max integer, p_answer text, p_text text
) returns text language plpgsql as $$
declare
  n integer;
begin
  update public.attempts
     set submissions = submissions + 1
   where id = p_id and player_id = p_player and finished_at is null and expires_at + p_grace >= p_now
  returning submissions into n;
  if not found then
    return 'closed';
  end if;
  if n > p_max then
    return 'capped';
  end if;
  if p_answer is not null then
    insert into public.attempt_answers (attempt_id, answer_id) values (p_id, p_answer) on conflict do nothing;
    return case when found then 'accepted' else 'duplicate' end;
  end if;
  insert into public.attempt_rejects (attempt_id, text) values (p_id, left(p_text, 60)) on conflict do nothing;
  return 'rejected';
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.digly_submit(uuid, uuid, bigint, integer, integer, text, text) from anon, authenticated, public;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.digly_submit(uuid, uuid, bigint, integer, integer, text, text) to service_role;
  end if;
end $$;
