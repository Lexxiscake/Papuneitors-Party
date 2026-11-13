-- =====================================================================
-- Sesiones y algoritmo sin repetición.
--
-- * room_seen_questions recuerda qué preguntas ya salieron en la sala,
--   incluso después de reiniciar la partida. Dentro de una sala ninguna
--   pregunta se repite hasta agotar el mazo.
-- * restart_game vuelve al lobby conservando el mismo código, borra las
--   rondas y los votos, y mantiene a todos los jugadores.
-- =====================================================================

create table if not exists public.room_seen_questions (
  room_id     uuid not null references public.rooms (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  seen_at     timestamptz not null default now(),
  primary key (room_id, question_id)
);

alter table public.room_seen_questions enable row level security;
revoke all on public.room_seen_questions from anon, authenticated;

-- Las rondas que ya existían también cuentan como vistas.
insert into public.room_seen_questions (room_id, question_id)
select r.room_id, r.question_id from public.rounds r
on conflict do nothing;

create or replace function public._create_round(p_room uuid) returns public.rounds
language plpgsql security definer set search_path = '' as $$
declare
  v_q     uuid;
  v_num   int;
  v_incl  boolean;
  v_round public.rounds;
begin
  select coalesce((settings ->> 'include_uncomfortable')::boolean, true)
    into v_incl from public.rooms where id = p_room;

  select q.id into v_q from public.questions q
  where q.is_active and q.room_id = p_room
    and not exists (select 1 from public.room_seen_questions s
                    where s.room_id = p_room and s.question_id = q.id)
  order by random() limit 1;

  if v_q is null then
    select q.id into v_q from public.questions q
    where q.is_active and q.room_id is null
      and (v_incl or q.category <> 'incomodas')
      and not exists (select 1 from public.room_seen_questions s
                      where s.room_id = p_room and s.question_id = q.id)
    order by random() limit 1;
  end if;

  if v_q is null then return null; end if;

  select coalesce(max(round_number), 0) + 1 into v_num from public.rounds where room_id = p_room;
  insert into public.rounds (room_id, question_id, round_number)
    values (p_room, v_q, v_num) returning * into v_round;
  insert into public.room_seen_questions (room_id, question_id)
    values (p_room, v_q) on conflict do nothing;
  insert into public.round_players (round_id, user_id)
    select v_round.id, user_id from public.room_members where room_id = p_room;
  update public.rooms set last_activity_at = now() where id = p_room;
  return v_round;
end $$;

-- Vuelve al lobby para otra sesión con el mismo código y los mismos jugadores.
create or replace function public.restart_game(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room   public.rooms;
  v_rounds int;
  v_left   int;
  v_reset  boolean := false;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.status not in ('playing', 'finished') then raise exception 'invalid_state'; end if;

  v_rounds := (v_room.settings ->> 'total_rounds')::int;

  select count(*) into v_left
  from public.questions q
  where q.is_active
    and (q.room_id = p_room or q.room_id is null)
    and (q.room_id is not null
         or coalesce((v_room.settings ->> 'include_uncomfortable')::boolean, true)
         or q.category <> 'incomodas')
    and not exists (select 1 from public.room_seen_questions s
                    where s.room_id = p_room and s.question_id = q.id);

  -- Si ya no alcanzan las preguntas sin repetir, se baraja el mazo completo.
  if v_left < v_rounds then
    delete from public.room_seen_questions where room_id = p_room;
    v_reset := true;
  end if;

  delete from public.answers
   where round_id in (select id from public.rounds where room_id = p_room);
  delete from public.round_players
   where round_id in (select id from public.rounds where room_id = p_room);
  delete from public.rounds where room_id = p_room;

  update public.room_members set is_ready = false where room_id = p_room;
  update public.rooms set status = 'lobby', last_activity_at = now() where id = p_room;

  return jsonb_build_object('ok', true, 'deck_reset', v_reset);
end $$;

revoke execute on function public.restart_game(uuid) from public, anon;
grant execute on function public.restart_game(uuid) to authenticated;
