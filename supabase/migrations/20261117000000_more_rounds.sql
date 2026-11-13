-- =====================================================================
-- Más rondas por partida: el límite pasa de 30 a 60.
-- (Antes la interfaz solo dejaba 15 y la función cortaba en 30.)
-- =====================================================================

create or replace function public.create_room(
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
  if p_max_players not between 2 and 20 or p_total_rounds not between 1 and 60 then
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
