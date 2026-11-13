-- =====================================================================
-- Sistema de intensidad 🟢🟡🟠🔴
--
-- Cada pregunta tiene un nivel de 1 a 4 y la partida sube de tono:
--   🟢 20% inicial  · 🟡 25% · 🟠 30% · 🔴 25% final
--
-- El nivel se calcula con una función interna a partir del texto, así
-- también funciona con las preguntas que añaden los jugadores.
-- Sigue sin repetirse ninguna pregunta dentro de la sala.
-- =====================================================================

alter table public.questions
  add column if not exists intensity smallint not null default 1;

alter table public.questions drop constraint if exists questions_intensity_check;
alter table public.questions
  add constraint questions_intensity_check check (intensity between 1 and 4);

create index if not exists questions_intensity_idx
  on public.questions (intensity) where room_id is null and is_active;

-- Clasificador interno. 4 = explícito, 3 = fuerte, 2 = picante, 1 = suave.
create or replace function public._guess_intensity(p_content text) returns smallint
language sql immutable set search_path = '' as $fn$
  select case
    when p_content ~* $re$sexo|\msexual|fetiche|bdsm|tr[ií]o|org[ií]a|orgasmo|nude|desnud|er[oó]tic|sexting|juguetes?|fantas[ií]a|[ií]ntim|intim|acost(?:arse|ó|e|er|ado)|en la cama|en su cama|en tu cama|bes(?:o|ar|ó|e|ado)|virgen|porno|nsfw|excitad|placer|nalgas?|tetas|pene|vagina|oral|anal|masaje|cosplay|dominantes?|sumis|intercambiar roles|atracci[oó]n|atra[ií]d|deseo|caliente|cachond|fotos? [ií]ntimas|pack\M|aventura|una noche|lig(?:ar|ado|ue)|qu[ií]mica|cuerpo|tocar|provoc|sensual|sedu|exhibicion|experiencia sexual|experimentar|contenido para adultos|primera vez|experiencia bisexual$re$ then 4

    when p_content ~* $re$femboy|gay|bisexual|homosexual|mismo sexo|orientaci[oó]n|infiel|infidelid|cuerno|amante|\mex\M|expareja|ex pareja|prohibid|traici|secreto|mentir|mentira|enga[ñn]|manipul|narcis|rencor|envidia|venganza|estaf|ilegal|c[aá]rcel|prisi[oó]n|droga|doble vida|obsesi[oó]n|celos|stalk|acoso|apuesta|traidor|filtra|chisme|hablar mal|odi|enemigo|culpa|control|\mpoder|ambici[oó]n|secta|simulaci[oó]n|apocalipsis|extraterrestre|crush|enamor|romance|rom[aá]ntic|pareja|relaci[oó]n|amor|rechaz|confes|arruinar|sospechos|solter|casi algo|friendzone|coquete|comprometedor|celular de su pareja|app de citas$re$ then 3

    when p_content ~* $re$fiesta|borrach|alcohol|redes|internet|videojuego|anime|influencer|famos|loter[ií]a|millonario|dinero|trabajo|jefe|universidad|emprender|mudarse|pa[ií]s|futuro|casar|hijo|perfil|cuenta|discord|virtual|cita|llorar|espejo|miedo|sue[ñn]o|escuela|colegio|profesor|comida|animal|mascota|viaje|verg[uü]enza|rid[ií]cul|meme|guapo|moda|risa|bail|celular|m[oó]vil|examen|copi|amistad|amigo|grupo|muerte|morir|edad|viejo|joven|herman|familia|mam[aá]|pap[aá]$re$ then 2

    else 1
  end::smallint
$fn$;

revoke execute on function public._guess_intensity(text) from public, anon, authenticated;

-- Clasifica todo lo que ya existe (418 predeterminadas y las de salas).
update public.questions set intensity = public._guess_intensity(content);

-- Las preguntas nuevas de los jugadores también entran con su nivel.
create or replace function public.add_room_question(p_room uuid, p_content text)
returns public.questions
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

  insert into public.questions (content, category, room_id, created_by, intensity)
  values (v_text, 'aleatorias', p_room, v_uid, public._guess_intensity(v_text))
  returning * into v_q;
  update public.rooms set last_activity_at = now() where id = p_room;
  return v_q;
end $$;

grant execute on function public.add_room_question(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Elige la pregunta de cada ronda según el avance de la partida.
-- ---------------------------------------------------------------------
create or replace function public._create_round(p_room uuid) returns public.rounds
language plpgsql security definer set search_path = '' as $$
declare
  v_q     uuid;
  v_num   int;
  v_total int;
  v_incl  boolean;
  v_prog  numeric;
  v_level int;
  v_lvl   int;
  v_off   int;
  v_round public.rounds;
begin
  select coalesce((settings ->> 'include_uncomfortable')::boolean, true),
         greatest(coalesce((settings ->> 'total_rounds')::int, 8), 1)
    into v_incl, v_total
  from public.rooms where id = p_room;

  select coalesce(max(round_number), 0) + 1 into v_num
  from public.rounds where room_id = p_room;

  -- Punto medio de la ronda: así hasta una partida de 4 rondas pasa por
  -- los cuatro niveles (1-2-3-4) y una de 50 reparte 20/25/30/25.
  v_prog := case when v_total <= 1 then 0
                 else (v_num - 0.5) / v_total end;
  v_level := case when v_prog < 0.20 then 1
                  when v_prog < 0.45 then 2
                  when v_prog < 0.75 then 3
                  else 4 end;
  -- Sin preguntas incómodas no hay material para los niveles altos.
  if not v_incl then v_level := least(v_level, 2); end if;

  -- 1) Preguntas propias de la sala: siempre tienen prioridad.
  select q.id into v_q from public.questions q
  where q.is_active and q.room_id = p_room
    and not exists (select 1 from public.room_seen_questions s
                    where s.room_id = p_room and s.question_id = q.id)
  order by random() limit 1;

  -- 2) Predeterminadas del nivel que toca; si se agotó, prueba los vecinos.
  for v_off in 0..6 loop
    exit when v_q is not null;
    v_lvl := v_level + case
      when v_off = 0 then 0
      when v_off % 2 = 1 then (v_off + 1) / 2
      else -(v_off / 2)
    end;
    v_lvl := least(4, greatest(1, v_lvl));
    select q.id into v_q from public.questions q
    where q.is_active and q.room_id is null
      and (v_incl or q.category <> 'incomodas')
      and q.intensity = v_lvl
      and not exists (select 1 from public.room_seen_questions s
                      where s.room_id = p_room and s.question_id = q.id)
    order by random() limit 1;
  end loop;

  -- 3) Último recurso: cualquier pregunta sin usar (mazo agotado por nivel).
  if v_q is null then
    select q.id into v_q from public.questions q
    where q.is_active and q.room_id is null
      and (v_incl or q.category <> 'incomodas')
      and not exists (select 1 from public.room_seen_questions s
                      where s.room_id = p_room and s.question_id = q.id)
    order by random() limit 1;
  end if;

  if v_q is null then return null; end if;

  insert into public.rounds (room_id, question_id, round_number)
    values (p_room, v_q, v_num) returning * into v_round;
  insert into public.room_seen_questions (room_id, question_id)
    values (p_room, v_q) on conflict do nothing;
  insert into public.round_players (round_id, user_id)
    select v_round.id, user_id from public.room_members where room_id = p_room;
  update public.rooms set last_activity_at = now() where id = p_room;
  return v_round;
end $$;
