"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabase";
import type {
  Answer,
  Member,
  Profile,
  Question,
  Room,
  Round,
  RoundPlayer,
  Snapshot,
} from "./types";

const MESSAGES: Record<string, string> = {
  supabase_not_configured: "Falta configurar Supabase. Revisa el archivo .env.local.",
  invalid_login_credentials: "Correo o contraseña incorrectos.",
  email_not_confirmed: "Todavía no confirmas tu correo. Revisa tu bandeja de entrada.",
  user_already_registered: "Ese correo ya tiene una cuenta. Inicia sesión.",
  password_should_be_at_least: "La contraseña necesita al menos 8 caracteres.",
  weak_password: "La contraseña es demasiado débil. Usa al menos 8 caracteres.",
  unable_to_validate_email: "El correo no es válido.",
  signup_is_disabled: "El registro está desactivado en este proyecto.",
  signups_not_allowed: "El registro está desactivado en este proyecto.",
  email_rate_limit:
    "Supabase bloqueó los correos de confirmación (límite por hora). Desactiva 'Confirm email' en Supabase: Authentication → Sign In / Providers → Email.",
  not_authenticated: "Tu sesión expiró. Vuelve a iniciar sesión.",
  invalid_settings: "Los ajustes de la sala no son válidos.",
  too_many_rooms: "Ya tienes 3 salas activas. Termina o abandona una antes de crear otra.",
  room_not_found: "No existe una sala con ese código. Revisa que esté bien escrito.",
  room_expired: "Esa sala expiró porque se quedó sin jugadores. Pide al anfitrión que cree una nueva.",
  room_not_joinable: "La partida ya empezó. No puedes unirte ahora.",
  room_full: "La sala está llena.",
  not_in_room: "No estás en esa sala.",
  not_host: "Solo el anfitrión puede hacer eso.",
  invalid_state: "La sala no está en el estado correcto para esa acción.",
  not_enough_players: "Necesitas al menos 2 jugadores para empezar.",
  no_questions_available: "No quedan preguntas disponibles. Añade algunas a la sala.",
  round_not_found: "Esa ronda ya no existe.",
  round_closed: "La votación de esta ronda ya cerró.",
  not_in_round: "No participas en esta ronda.",
  invalid_target: "Ese nombre no está en la lista de papuneitors.",
  already_voted: "Ya votaste en esta ronda.",
  no_votes: "Todavía no hay votos que revelar.",
  round_in_progress: "Todavía hay una ronda en votación.",
  question_not_found: "Esa pregunta ya no existe.",
  invalid_question: "La pregunta debe tener entre 8 y 150 caracteres.",
  duplicate_question: "Esa pregunta ya está en la sala.",
  too_many_pending: "Máximo 3 preguntas tuyas sin usar por sala.",
  question_already_used: "Esa pregunta ya se usó en una ronda.",
  not_allowed: "No tienes permiso para borrar esa pregunta.",
};

const UNIQUE = /could not find|does not exist|schema cache|relation .* does not exist/i;
const ROOM_KEY = "papuneitors_sala";

function forgetRoom() {
  try {
    window.localStorage.removeItem(ROOM_KEY);
  } catch {
    // almacenamiento no disponible
  }
}

export function friendlyError(raw: unknown): string {
  const msg =
    typeof raw === "string"
      ? raw
      : (raw as { message?: string; details?: string; hint?: string })?.message ??
        (raw as { error_description?: string })?.error_description ??
        "";
  const low = msg.toLowerCase();
  const key = Object.keys(MESSAGES).find((k) => {
    const spaced = k.replace(/_/g, " ");
    return low.includes(k) || low.includes(spaced);
  });
  if (key) return MESSAGES[key];
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(low)) {
    return "No se pudo conectar con el servidor. Revisa tu internet e intenta de nuevo.";
  }
  if (/rate limit|too many requests/i.test(low)) {
    return "Demasiadas solicitudes. Espera un momento e intenta de nuevo.";
  }
  if (UNIQUE.test(msg)) {
    return "Falta ejecutar el SQL de la base de datos. Revisa el README (paso de Supabase).";
  }
  return msg || "Algo salió mal. Intenta de nuevo.";
}

type RunOptions = { key?: string; silent?: boolean };

export function useParty() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileState, setProfileState] = useState<"idle" | "loading" | "ready" | "missing">("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [restoringRoom, setRestoringRoom] = useState(false);
  const [activeRooms, setActiveRooms] = useState<{ id: string; code: string; status: string }[]>([]);

  const roomIdRef = useRef<string | null>(null);
  roomIdRef.current = roomId;
  const refreshSeq = useRef(0);
  const restoredRef = useRef(false);

  // ---------- Sesión ----------
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }
    const sb = supabase();
    let active = true;
    sb.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch((e) => console.error("No se pudo leer la sesión:", e))
      .finally(() => {
        if (active) setAuthReady(true);
      });
    const { data: sub } = sb.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setProfileState("idle");
        setRoomId(null);
        setSnapshot(null);
        forgetRoom();
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ---------- Perfil ----------
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const uid = session?.user?.id;
    if (!uid) {
      setProfile(null);
      setProfileState("idle");
      return;
    }
    let active = true;
    setProfileState("loading");
    (async () => {
      const sb = supabase();
      for (let i = 0; i < 8; i++) {
        const { data, error: e } = await sb
          .from("profiles")
          .select("id,username,avatar")
          .eq("id", uid)
          .maybeSingle();
        if (!active) return;
        if (data) {
          setProfile(data as Profile);
          setProfileState("ready");
          return;
        }
        if (e) console.error("No se pudo cargar el perfil:", e);
        await new Promise((r) => setTimeout(r, 400));
      }
      if (active) setProfileState("missing");
    })();
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  // ---------- Reconexión automática tras recargar ----------
  useEffect(() => {
    if (!isSupabaseConfigured || !profile || restoredRef.current) return;
    restoredRef.current = true;
    if (roomIdRef.current) return;

    let code: string | null = null;
    try {
      code = window.localStorage.getItem(ROOM_KEY);
    } catch {
      return;
    }
    if (!code) return;

    let active = true;
    setRestoringRoom(true);
    (async () => {
      try {
        const { data, error: e } = await supabase().rpc("join_room", { p_code: code });
        if (!active) return;
        if (e || !data?.id) forgetRoom();
        else setRoomId(data.id as string);
      } catch {
        if (active) forgetRoom();
      } finally {
        if (active) setRestoringRoom(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [profile]);

  // Guarda el código para poder reconectar si se recarga la página.
  useEffect(() => {
    if (!snapshot?.room.code) return;
    try {
      window.localStorage.setItem(ROOM_KEY, snapshot.room.code);
    } catch {
      // almacenamiento no disponible
    }
  }, [snapshot?.room.code]);

  // Salas activas del usuario (para reconectar o liberar el límite de 3).
  useEffect(() => {
    if (!isSupabaseConfigured || !profile || roomId) {
      setActiveRooms([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data, error: e } = await supabase()
          .from("room_members")
          .select("rooms!inner(id,code,status)")
          .eq("user_id", profile.id);
        if (!active) return;
        if (e) {
          console.error("No se pudieron cargar las salas activas:", e);
          return;
        }
        const list = (data ?? [])
          .map((row) => (row as { rooms: { id: string; code: string; status: string } | null }).rooms)
          .filter((r): r is { id: string; code: string; status: string } => !!r)
          .filter((r) => r.status === "lobby" || r.status === "playing");
        setActiveRooms(list);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile, roomId, snapshot?.room.status]);

  // ---------- Lectura de la sala ----------
  const refresh = useCallback(async (opts: { silent?: boolean } = {}) => {
    const id = roomIdRef.current;
    if (!id) return;
    const seq = ++refreshSeq.current;
    try {
      const sb = supabase();
      const { data: room, error: roomErr } = await sb
        .from("rooms")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (roomErr) throw roomErr;
      if (!room) {
        if (roomIdRef.current !== id) return;
        setRoomId(null);
        setSnapshot(null);
        setNotice("La sala ya no está disponible.");
        return;
      }

      const [membersRes, questionsRes, roundsRes] = await Promise.all([
        sb
          .from("room_members")
          .select("user_id,is_ready,joined_at,profiles(username,avatar)")
          .eq("room_id", id)
          .order("joined_at"),
        sb
          .from("questions")
          .select("id,content,category,is_active,room_id,created_by,created_at")
          .eq("room_id", id)
          .eq("is_active", true)
          .order("created_at"),
        sb
          .from("rounds")
          .select(
            "id,room_id,question_id,round_number,status,started_at,revealed_at,questions(content,category)",
          )
          .eq("room_id", id)
          .order("round_number"),
      ]);

      if (membersRes.error) throw membersRes.error;
      if (questionsRes.error) throw questionsRes.error;
      if (roundsRes.error) throw roundsRes.error;

      const rounds = (roundsRes.data ?? []) as unknown as Round[];
      const roundIds = rounds.map((r) => r.id);

      let roundPlayers: RoundPlayer[] = [];
      let answers: Answer[] = [];
      if (roundIds.length) {
        const [playersRes, answersRes] = await Promise.all([
          sb
            .from("round_players")
            .select("round_id,user_id,has_voted,profiles(username,avatar)")
            .in("round_id", roundIds),
          sb
            .from("answers")
            .select("round_id,voter_id,selected_name")
            .in("round_id", roundIds),
        ]);
        if (playersRes.error) throw playersRes.error;
        if (answersRes.error) throw answersRes.error;
        roundPlayers = (playersRes.data ?? []) as unknown as RoundPlayer[];
        answers = (answersRes.data ?? []) as unknown as Answer[];
      }

      if (seq !== refreshSeq.current || roomIdRef.current !== id) return;
      setSnapshot({
        room: room as unknown as Room,
        members: (membersRes.data ?? []) as unknown as Member[],
        questions: (questionsRes.data ?? []) as unknown as Question[],
        rounds,
        roundPlayers,
        answers,
      });
      setReconnecting(false);
    } catch (e) {
      console.error("Error actualizando la sala:", e);
      if (!opts.silent) setError(friendlyError(e));
      else setReconnecting(true);
    }
  }, []);

  // Carga inicial / cambio de sala
  useEffect(() => {
    if (!roomId) {
      setSnapshot(null);
      return;
    }
    void refresh({ silent: true });
  }, [roomId, refresh]);

  // Realtime + respaldo por sondeo (por si Realtime no está activo)
  useEffect(() => {
    if (!roomId || !isSupabaseConfigured) return;
    const sb = supabase();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh({ silent: true }), 120);
    };

    const channel = sb
      .channel(`sala:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, schedule)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
        schedule,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${roomId}` }, schedule)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "questions", filter: `room_id=eq.${roomId}` },
        schedule,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "round_players" }, schedule)
      .subscribe();

    const poll = setInterval(() => void refresh({ silent: true }), 6000);
    const onFocus = () => void refresh({ silent: true });
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      void sb.removeChannel(channel);
    };
  }, [roomId, refresh]);

  // ---------- Utilidades ----------
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, opts: RunOptions = {}): Promise<T | undefined> => {
      setBusy(key);
      if (!opts.silent) setError("");
      try {
        return await fn();
      } catch (e) {
        if (!opts.silent) setError(friendlyError(e));
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const rpc = useCallback(async <T,>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
    const { data, error: e } = await supabase().rpc(name, args);
    if (e) throw e;
    return data as T;
  }, []);

  // ---------- Autenticación ----------
  const signIn = useCallback(
    (email: string, password: string) =>
      run("auth", async () => {
        setNotice("");
        const { error: e } = await supabase().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (e) throw e;
        return true;
      }),
    [run],
  );

  const signUp = useCallback(
    async (username: string, email: string, password: string) => {
      const clean = username.trim();
      if (clean.length < 2 || clean.length > 20) {
        setError("El nombre de usuario debe tener entre 2 y 20 caracteres.");
        return false;
      }
      if (password.length < 8) {
        setError("La contraseña necesita al menos 8 caracteres.");
        return false;
      }
      return run("auth", async () => {
        setNotice("");
        const { data, error: e } = await supabase().auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: clean } },
        });
        if (e) throw e;
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError(MESSAGES.user_already_registered);
          return false;
        }
        if (!data.session) {
          setNotice(
            "Cuenta creada, pero el proyecto exige confirmar el correo. Desactiva 'Confirm email' en Supabase (Authentication → Sign In / Providers → Email) para entrar sin correo.",
          );
          return false;
        }
        return true;
      });
    },
    [run],
  );

  const signOut = useCallback(async () => {
    // Cerrar sesión no es abandonar la sala: la membresía se conserva para
    // poder volver a entrar con el mismo código. Solo se sale con "Abandonar sala".
    setRoomId(null);
    setSnapshot(null);
    setProfile(null);
    setError("");
    setNotice("");
    forgetRoom();
    try {
      await supabase().auth.signOut();
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  const retryProfile = useCallback(() => {
    setProfileState("loading");
    const uid = session?.user?.id;
    if (!uid) return;
    void (async () => {
      const { data, error: e } = await supabase()
        .from("profiles")
        .select("id,username,avatar")
        .eq("id", uid)
        .maybeSingle();
      if (data) {
        setProfile(data as Profile);
        setProfileState("ready");
      } else {
        if (e) setError(friendlyError(e));
        setProfileState("missing");
      }
    })();
  }, [session?.user?.id]);

  // ---------- Salas ----------
  const createRoom = useCallback(
    async (maxPlayers: number, totalRounds: number, includeUncomfortable: boolean) => {
      const room = await run("create", () =>
        rpc<Room>("create_room", {
          p_max_players: maxPlayers,
          p_total_rounds: totalRounds,
          p_include_uncomfortable: includeUncomfortable,
        }),
      );
      if (room?.id) {
        setNotice("");
        setRoomId(room.id);
      }
    },
    [run, rpc],
  );

  const joinRoom = useCallback(
    async (code: string) => {
      const clean = code.trim().toUpperCase();
      if (clean.length !== 6) {
        setError("El código tiene exactamente 6 caracteres.");
        return;
      }
      const room = await run("join", () => rpc<Room>("join_room", { p_code: clean }));
      if (room?.id) {
        setNotice("");
        setRoomId(room.id);
      }
    },
    [run, rpc],
  );

  const leaveRoom = useCallback(async () => {
    const id = roomIdRef.current;
    if (!id) return;
    const result = await run("leave", () => rpc("leave_room", { p_room: id }));
    if (result === undefined) return;
    forgetRoom();
    setRoomId(null);
    setSnapshot(null);
    setNotice("");
  }, [run, rpc]);

  const setReady = useCallback(
    (ready: boolean) => {
      const id = roomIdRef.current;
      if (!id) return Promise.resolve();
      return run("ready", () => rpc("set_ready", { p_room: id, p_ready: ready }), { silent: true });
    },
    [run, rpc],
  );

  const startGame = useCallback(async () => {
    const id = roomIdRef.current;
    if (!id) return;
    await run("start", () => rpc("start_game", { p_room: id }));
    await refresh({ silent: true });
  }, [run, rpc, refresh]);

  const submitVote = useCallback(
    async (selectedName: string) => {
      const round = snapshot?.rounds[snapshot.rounds.length - 1];
      if (!round) return;
      await run("vote", () => rpc("submit_vote", { p_round: round.id, p_selected: selectedName }));
      await refresh({ silent: true });
    },
    [run, rpc, refresh, snapshot],
  );

  const forceReveal = useCallback(async () => {
    const round = snapshot?.rounds[snapshot.rounds.length - 1];
    if (!round) return;
    await run("reveal", () => rpc("force_reveal", { p_round: round.id }));
    await refresh({ silent: true });
  }, [run, rpc, refresh, snapshot]);

  const nextRound = useCallback(async () => {
    const id = roomIdRef.current;
    if (!id) return;
    await run("next", () => rpc("next_round", { p_room: id }));
    await refresh({ silent: true });
  }, [run, rpc, refresh]);

  const addQuestion = useCallback(
    async (content: string) => {
      const id = roomIdRef.current;
      if (!id) return false;
      const q = await run("addq", () => rpc<Question>("add_room_question", { p_room: id, p_content: content }));
      if (q?.id) {
        setNotice("");
        await refresh({ silent: true });
        return true;
      }
      return false;
    },
    [run, rpc, refresh],
  );

  const deleteQuestion = useCallback(
    async (questionId: string) => {
      await run("delq", () => rpc("delete_room_question", { p_question: questionId }));
      await refresh({ silent: true });
    },
    [run, rpc, refresh],
  );

  const goHome = useCallback(() => {
    forgetRoom();
    setRoomId(null);
    setSnapshot(null);
    setError("");
    setNotice("");
  }, []);

  const openRoom = useCallback((id: string) => {
    setError("");
    setNotice("");
    setRoomId(id);
  }, []);

  const clearError = useCallback(() => setError(""), []);
  const clearNotice = useCallback(() => setNotice(""), []);

  return {
    session,
    authReady,
    profile,
    profileState,
    roomId,
    snapshot,
    busy,
    error,
    notice,
    reconnecting,
    restoringRoom,
    activeRooms,
    signIn,
    signUp,
    signOut,
    retryProfile,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    submitVote,
    forceReveal,
    nextRound,
    addQuestion,
    deleteQuestion,
    goHome,
    openRoom,
    clearError,
    clearNotice,
  };
}

export type Party = ReturnType<typeof useParty>;
