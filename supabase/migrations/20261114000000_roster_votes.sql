-- =====================================================================
-- Votos por nombre de la lista fija (los 19 papuneitors).
-- Antes: answers.selected_user_id -> profiles(id), solo cuentas registradas.
-- Ahora: answers.selected_name -> nombre canónico de la lista.
--
-- Es una migración compatible: no borra columnas ni funciones anteriores,
-- así la versión antigua de la app sigue funcionando mientras se despliega
-- la nueva. Los votos nuevos guardan solo selected_name.
-- =====================================================================

alter table public.answers add column if not exists selected_name text;
alter table public.answers alter column selected_user_id drop not null;

-- Los votos viejos se conservan usando el nombre del perfil que eligieron.
update public.answers a
   set selected_name = p.username
  from public.profiles p
 where p.id = a.selected_user_id
   and a.selected_name is null;

create or replace function public.submit_vote(p_round uuid, p_selected text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_round public.rounds;
  v_name  text;
begin
  v_name := btrim(coalesce(p_selected, ''));
  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'invalid_target';
  end if;

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

  begin
    insert into public.answers (round_id, voter_id, selected_name)
    values (p_round, v_uid, v_name);
  exception when unique_violation then
    raise exception 'already_voted';
  end;

  update public.round_players set has_voted = true where round_id = p_round and user_id = v_uid;
  perform public._try_reveal(p_round);
  update public.rooms set last_activity_at = now() where id = v_round.room_id;
end $$;

revoke execute on function public.submit_vote(uuid, text) from public, anon;
grant execute on function public.submit_vote(uuid, text) to authenticated;
