-- =====================================================================
-- Aviso claro al intentar entrar a una sala que ya expiró.
-- Antes se respondía 'room_not_found' y confundía ("no existe");
-- ahora se distingue de un código inexistente.
-- =====================================================================

create or replace function public.join_room(p_code text) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_room public.rooms;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status = 'expired' then raise exception 'room_expired'; end if;

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
