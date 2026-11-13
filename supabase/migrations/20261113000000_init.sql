-- =====================================================================
-- Papuneitors Party: migración inicial
-- Tablas, restricciones, RLS, funciones del juego (RPC) y Realtime.
-- Los correos y contraseñas viven en auth.users (Supabase Auth) y nunca
-- se exponen por la API. Aquí solo guardamos el perfil público.
-- =====================================================================

-- ---------- Tipos ----------
create type public.room_status as enum ('lobby', 'playing', 'finished', 'expired');
create type public.round_status as enum ('voting', 'revealed');
create type public.question_category as enum
  ('graciosas', 'incomodas', 'amistad', 'caoticas', 'personalidad', 'aleatorias');

-- ---------- Tablas ----------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null check (char_length(username) between 2 and 20),
  avatar     text,
  created_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));

create table public.rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  host_id          uuid not null references public.profiles (id),
  status           public.room_status not null default 'lobby',
  settings         jsonb not null default
                   '{"max_players": 10, "total_rounds": 8, "include_uncomfortable": true}',
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index rooms_host_idx on public.rooms (host_id);

create table public.room_members (
  room_id   uuid not null references public.rooms (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  is_ready  boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members (user_id);

-- room_id null = pregunta predeterminada. room_id con valor = pregunta de jugadores de esa sala.
create table public.questions (
  id         uuid primary key default gen_random_uuid(),
  content    text not null check (char_length(content) between 8 and 160),
  category   public.question_category not null default 'aleatorias',
  is_active  boolean not null default true,
  room_id    uuid references public.rooms (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index questions_room_idx on public.questions (room_id);
create unique index questions_default_content_key
  on public.questions (lower(content)) where room_id is null;

create table public.rounds (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms (id) on delete cascade,
  question_id  uuid not null references public.questions (id),
  round_number int not null,
  status       public.round_status not null default 'voting',
  started_at   timestamptz not null default now(),
  revealed_at  timestamptz,
  unique (room_id, round_number),
  unique (room_id, question_id)
);

-- Foto de quiénes juegan cada ronda (y si ya votaron). No dice por quién votaron.
create table public.round_players (
  round_id  uuid not null references public.rounds (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  has_voted boolean not null default false,
  primary key (round_id, user_id)
);

-- Se puede votar por CUALQUIER perfil y por uno mismo.
create table public.answers (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null,
  voter_id         uuid not null,
  selected_user_id uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),
  unique (round_id, voter_id),
  foreign key (round_id, voter_id) references public.round_players (round_id, user_id) on delete cascade
);
create index answers_round_idx on public.answers (round_id);

-- ---------- Perfil automático al registrarse ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_base  text;
  v_final text;
begin
  v_base := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
                          split_part(new.email, '@', 1)), 20);
  if char_length(v_base) < 2 then v_base := v_base || '_x'; end if;
  v_final := v_base;
  if exists (select 1 from public.profiles where lower(username) = lower(v_final)) then
    v_final := left(v_base, 15) || '_' || substr(md5(random()::text), 1, 4);
  end if;
  insert into public.profiles (id, username) values (new.id, v_final);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Funciones auxiliares para RLS (evitan recursión) ----------
create function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.room_members
                 where room_id = p_room and user_id = (select auth.uid()));
$$;

create function public.round_room(p_round uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select room_id from public.rounds where id = p_round;
$$;

-- Las respuestas de una ronda son visibles solo cuando ya se reveló y eres miembro.
create function public.round_visible(p_round uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rounds r
                 where r.id = p_round and r.status = 'revealed'
                   and public.is_room_member(r.room_id));
$$;

-- ---------- RLS: solo lectura; toda escritura pasa por las funciones ----------
alter table public.profiles       enable row level security;
alter table public.rooms          enable row level security;
alter table public.room_members   enable row level security;
alter table public.questions      enable row level security;
alter table public.rounds         enable row level security;
alter table public.round_players  enable row level security;
alter table public.answers        enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy rooms_select on public.rooms for select to authenticated
  using (public.is_room_member(id));
create policy room_members_select on public.room_members for select to authenticated
  using (public.is_room_member(room_id));
create policy questions_select on public.questions for select to authenticated
  using (is_active and (room_id is null or public.is_room_member(room_id)));
create policy rounds_select on public.rounds for select to authenticated
  using (public.is_room_member(room_id));
create policy round_players_select on public.round_players for select to authenticated
  using (public.is_room_member(public.round_room(round_id)));
create policy answers_select on public.answers for select to authenticated
  using (voter_id = (select auth.uid()) or public.round_visible(round_id));

-- ---------- Funciones internas (no accesibles desde el cliente) ----------
create function public._try_reveal(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.round_players where round_id = p_round)
     and not exists (select 1 from public.round_players where round_id = p_round and not has_voted) then
    update public.rounds set status = 'revealed', revealed_at = now()
    where id = p_round and status = 'voting';
  end if;
end $$;

-- Crea la siguiente ronda. Prioridad: preguntas añadidas por los jugadores; luego las predeterminadas.
-- Devuelve null si ya no quedan preguntas.
create function public._create_round(p_room uuid) returns public.rounds
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
    and not exists (select 1 from public.rounds r where r.room_id = p_room and r.question_id = q.id)
  order by random() limit 1;

  if v_q is null then
    select q.id into v_q from public.questions q
    where q.is_active and q.room_id is null
      and (v_incl or q.category <> 'incomodas')
      and not exists (select 1 from public.rounds r where r.room_id = p_room and r.question_id = q.id)
    order by random() limit 1;
  end if;

  if v_q is null then return null; end if;

  select coalesce(max(round_number), 0) + 1 into v_num from public.rounds where room_id = p_room;
  insert into public.rounds (room_id, question_id, round_number)
    values (p_room, v_q, v_num) returning * into v_round;
  insert into public.round_players (round_id, user_id)
    select v_round.id, user_id from public.room_members where room_id = p_room;
  update public.rooms set last_activity_at = now() where id = p_room;
  return v_round;
end $$;

-- ---------- Funciones del juego (RPC) ----------
create function public.create_room(
  p_max_players int default 10,
  p_total_rounds int default 8,
  p_include_uncomfortable boolean default true
) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code  text;
  v_room  public.rooms;
  i       int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_max_players not between 2 and 20 or p_total_rounds not between 1 and 30 then
    raise exception 'invalid_settings';
  end if;
  if (select count(*) from public.rooms
      where host_id = v_uid and status in ('lobby', 'playing')) >= 3 then
    raise exception 'too_many_rooms';
  end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * 32)::int, 1);
    end loop;
    begin
      insert into public.rooms (code, host_id, settings)
      values (v_code, v_uid, jsonb_build_object('max_players', p_max_players,
              'total_rounds', p_total_rounds, 'include_uncomfortable', p_include_uncomfortable))
      returning * into v_room;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  insert into public.room_members (room_id, user_id) values (v_room.id, v_uid);
  return v_room;
end $$;

create function public.join_room(p_code text) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_room public.rooms;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found or v_room.status = 'expired' then raise exception 'room_not_found'; end if;

  if exists (select 1 from public.room_members where room_id = v_room.id and user_id = v_uid) then
    return v_room;  -- reconexión: ya era miembro
  end if;
  if v_room.status <> 'lobby' then raise exception 'room_not_joinable'; end if;
  if (select count(*) from public.room_members where room_id = v_room.id)
       >= (v_room.settings ->> 'max_players')::int then
    raise exception 'room_full';
  end if;
  insert into public.room_members (room_id, user_id) values (v_room.id, v_uid);
  update public.rooms set last_activity_at = now() where id = v_room.id;
  return v_room;
end $$;

create function public.set_ready(p_room uuid, p_ready boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.room_members set is_ready = p_ready
  where room_id = p_room and user_id = auth.uid();
  if not found then raise exception 'not_in_room'; end if;
end $$;

create function public.leave_room(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_room     public.rooms;
  v_round    uuid;
  v_new_host uuid;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found or not exists (select 1 from public.room_members
                              where room_id = p_room and user_id = v_uid) then
    raise exception 'not_in_room';
  end if;

  delete from public.room_members where room_id = p_room and user_id = v_uid;

  select id into v_round from public.rounds
  where room_id = p_room and status = 'voting' order by round_number desc limit 1;
  if v_round is not null then
    delete from public.round_players where round_id = v_round and user_id = v_uid and not has_voted;
    perform public._try_reveal(v_round);
  end if;

  select user_id into v_new_host from public.room_members
  where room_id = p_room order by joined_at limit 1;

  if v_new_host is null then
    update public.rooms
       set status = case when status = 'finished' then status else 'expired' end,
           last_activity_at = now()
     where id = p_room;
  elsif v_room.host_id = v_uid then
    update public.rooms set host_id = v_new_host, last_activity_at = now() where id = p_room;
  else
    update public.rooms set last_activity_at = now() where id = p_room;
  end if;
end $$;

create function public.start_game(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room  public.rooms;
  v_round public.rounds;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.status <> 'lobby' then raise exception 'invalid_state'; end if;
  if (select count(*) from public.room_members where room_id = p_room) < 2 then
    raise exception 'not_enough_players';
  end if;
  v_round := public._create_round(p_room);
  if v_round.id is null then raise exception 'no_questions_available'; end if;
  update public.rooms set status = 'playing', last_activity_at = now() where id = p_room;
  return jsonb_build_object('round_id', v_round.id);
end $$;

create function public.submit_answer(p_round uuid, p_selected uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_round public.rounds;
begin
  select * into v_round from public.rounds where id = p_round for update;  -- serializa los votos
  if not found then raise exception 'round_not_found'; end if;
  if not exists (select 1 from public.room_members
                 where room_id = v_round.room_id and user_id = v_uid) then
    raise exception 'not_in_room';
  end if;
  if v_round.status <> 'voting' then raise exception 'round_closed'; end if;
  if not exists (select 1 from public.round_players where round_id = p_round and user_id = v_uid) then
    raise exception 'not_in_round';
  end if;
  if not exists (select 1 from public.profiles where id = p_selected) then
    raise exception 'invalid_target';
  end if;

  begin
    insert into public.answers (round_id, voter_id, selected_user_id)
    values (p_round, v_uid, p_selected);
  exception when unique_violation then
    raise exception 'already_voted';
  end;

  update public.round_players set has_voted = true where round_id = p_round and user_id = v_uid;
  perform public._try_reveal(p_round);
  update public.rooms set last_activity_at = now() where id = v_round.room_id;
end $$;

create function public.force_reveal(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_round public.rounds;
  v_room  public.rooms;
begin
  select * into v_round from public.rounds where id = p_round for update;
  if not found then raise exception 'round_not_found'; end if;
  select * into v_room from public.rooms where id = v_round.room_id;
  if v_room.host_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_round.status <> 'voting' then raise exception 'round_closed'; end if;
  if not exists (select 1 from public.answers where round_id = p_round) then
    raise exception 'no_votes';
  end if;
  update public.rounds set status = 'revealed', revealed_at = now() where id = p_round;
end $$;

create function public.next_round(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room  public.rooms;
  v_round public.rounds;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.status <> 'playing' then raise exception 'invalid_state'; end if;
  if exists (select 1 from public.rounds where room_id = p_room and status = 'voting') then
    raise exception 'round_in_progress';
  end if;

  if (select count(*) from public.rounds where room_id = p_room)
       < (v_room.settings ->> 'total_rounds')::int then
    v_round := public._create_round(p_room);
  end if;

  if v_round.id is null then
    update public.rooms set status = 'finished', last_activity_at = now() where id = p_room;
    return jsonb_build_object('finished', true);
  end if;
  return jsonb_build_object('finished', false, 'round_id', v_round.id);
end $$;

-- Cualquier miembro puede añadir preguntas en el lobby o durante la partida.
-- Entran con prioridad en el sorteo de la siguiente ronda.
create function public.add_room_question(p_room uuid, p_content text) returns public.questions
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_room public.rooms;
  v_text text;
  v_q    public.questions;
begin
  select * into v_room from public.rooms where id = p_room;
  if not found or not exists (select 1 from public.room_members
                              where room_id = p_room and user_id = v_uid) then
    raise exception 'not_in_room';
  end if;
  if v_room.status not in ('lobby', 'playing') then raise exception 'invalid_state'; end if;

  v_text := btrim(regexp_replace(btrim(coalesce(p_content, '')), '^¿+|\?+$', '', 'g'));
  if char_length(v_text) < 8 or char_length(v_text) > 150 then raise exception 'invalid_question'; end if;
  v_text := '¿' || upper(left(v_text, 1)) || substr(v_text, 2) || '?';

  if exists (select 1 from public.questions
             where room_id = p_room and lower(content) = lower(v_text)) then
    raise exception 'duplicate_question';
  end if;
  if (select count(*) from public.questions q
      where q.room_id = p_room and q.created_by = v_uid
        and not exists (select 1 from public.rounds r
                        where r.room_id = p_room and r.question_id = q.id)) >= 3 then
    raise exception 'too_many_pending';
  end if;

  insert into public.questions (content, category, room_id, created_by)
  values (v_text, 'aleatorias', p_room, v_uid) returning * into v_q;
  update public.rooms set last_activity_at = now() where id = p_room;
  return v_q;
end $$;

-- Borra una pregunta de la sala que aún no se haya usado (su autor o el anfitrión).
create function public.delete_room_question(p_question uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_q   public.questions;
begin
  select * into v_q from public.questions where id = p_question and room_id is not null;
  if not found then raise exception 'question_not_found'; end if;
  if v_q.created_by is distinct from v_uid
     and not exists (select 1 from public.rooms where id = v_q.room_id and host_id = v_uid) then
    raise exception 'not_allowed';
  end if;
  if exists (select 1 from public.rounds where question_id = p_question) then
    raise exception 'question_already_used';
  end if;
  delete from public.questions where id = p_question;
end $$;

-- Marca como expiradas las salas sin actividad (se programa con pg_cron, ver README).
create function public.expire_stale_rooms(p_hours int default 6) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update public.rooms set status = 'expired'
  where status in ('lobby', 'playing')
    and last_activity_at < now() - make_interval(hours => p_hours);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------- Permisos ----------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.rooms, public.room_members, public.questions,
                public.rounds, public.round_players, public.answers to authenticated;
grant update (username, avatar) on public.profiles to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_room_member(uuid), public.round_room(uuid), public.round_visible(uuid),
  public.create_room(int, int, boolean), public.join_room(text),
  public.set_ready(uuid, boolean), public.leave_room(uuid), public.start_game(uuid),
  public.submit_answer(uuid, uuid), public.force_reveal(uuid), public.next_round(uuid),
  public.add_room_question(uuid, text), public.delete_room_question(uuid)
  to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

-- ---------- Realtime ----------
alter table public.room_members  replica identity full;
alter table public.round_players replica identity full;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.rooms, public.room_members, public.rounds, public.round_players, public.questions;
  end if;
end $$;
