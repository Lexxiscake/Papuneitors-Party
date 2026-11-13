"use client";

import { useMemo, useState } from "react";
import type { Party } from "../lib/useParty";
import { Avatar, Brand } from "./ui";

export function LobbyScreen({ party }: { party: Party }) {
  const me = party.profile!;
  const s = party.snapshot!;
  const { room, members, questions, rounds } = s;
  const [newQ, setNewQ] = useState("");
  const [qErr, setQErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const isHost = room.host_id === me.id;
  const meMember = members.find((m) => m.user_id === me.id);
  const max = room.settings.max_players ?? 10;
  const total = room.settings.total_rounds ?? 8;
  const used = useMemo(() => new Set(rounds.map((r) => r.question_id)), [rounds]);
  const names = useMemo(
    () => new Map(members.map((m) => [m.user_id, m.profiles?.username ?? "Jugador"])),
    [members],
  );
  const hostName = names.get(room.host_id) ?? "el anfitrión";
  const readyCount = members.filter((m) => m.is_ready).length;

  function copy() {
    navigator.clipboard?.writeText(room.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1300);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const text = newQ.trim();
    if (text.length < 8) {
      setQErr("Escribe una pregunta de al menos 8 caracteres.");
      return;
    }
    setQErr("");
    const ok = await party.addQuestion(text);
    if (ok) setNewQ("");
  }

  return (
    <main>
      <div className="row toprow">
        <Brand />
        <button className="btn ghost" onClick={party.signOut}>Cerrar sesión</button>
      </div>

      <div className="card">
        <div className="row">
          <div>
            <p className="mut">Código de invitación</p>
            <div className="code">{room.code}</div>
          </div>
          <button className="btn ghost" onClick={copy}>{copied ? "¡Copiado!" : "Copiar"}</button>
        </div>
        <p className="mut" style={{ marginTop: 10, fontSize: ".85rem" }}>
          Comparte este código. La partida será de <b className="ink">{total}</b> rondas y hasta{" "}
          <b className="ink">{max}</b> jugadores.
        </p>
      </div>

      <div className="card">
        <div className="row">
          <b>Jugadores ({members.length})</b>
          <span className="mut">{readyCount} listos</span>
        </div>
        <div className="grid">
          {members.map((m) => {
            const name = m.profiles?.username ?? "Jugador";
            return (
              <div className="pl" key={m.user_id}>
                <Avatar n={name} s={30} />
                <span className="ellipsis">{name}{m.user_id === me.id && " (tú)"}</span>
                {m.user_id === room.host_id && <small>anfitrión</small>}
                <i className={m.is_ready ? "dot" : "dot idle"} title={m.is_ready ? "Listo" : "Sin marcar"} />
              </div>
            );
          })}
          {Array.from({ length: Math.max(0, Math.min(max, 8) - members.length) }).map((_, i) => (
            <div className="pl empty" key={`empty-${i}`}><span className="avghost" />Esperando…</div>
          ))}
        </div>

        {!meMember?.is_ready ? (
          <button className="btn ghost full" style={{ marginTop: 12 }} disabled={party.busy === "ready"}
            onClick={() => party.setReady(true)}>
            Marcar que estoy listo
          </button>
        ) : (
          <button className="btn ghost full" style={{ marginTop: 12 }} disabled={party.busy === "ready"}
            onClick={() => party.setReady(false)}>
            Quitar “listo”
          </button>
        )}

        <p className="mut" style={{ marginTop: 10, fontSize: ".85rem" }}>
          Marcar “listo” es informativo: el anfitrión decide cuándo empezar.
        </p>
      </div>

      <div className="card">
        <b>Preguntas de la sala</b>
        <p className="mut" style={{ marginTop: 6 }}>
          Cualquiera puede añadir hasta 3 preguntas pendientes. Entran al sorteo junto con las
          predeterminadas.
        </p>
        <form onSubmit={add}>
          <label className="field">
            Nueva pregunta
            <input
              maxLength={140}
              autoComplete="off"
              placeholder="¿Quién…?"
              value={newQ}
              onChange={(e) => setNewQ(e.target.value)}
            />
          </label>
          <button className="btn ghost full" style={{ marginTop: 10 }} disabled={party.busy === "addq"}>
            {party.busy === "addq" ? "Añadiendo…" : "Añadir pregunta"}
          </button>
        </form>

        <p className="err" role="alert">{qErr}</p>

        {questions.length === 0 && <p className="mut" style={{ marginTop: 10 }}>Aún no hay preguntas propias.</p>}
        {questions.map((q) => (
          <div className="vt qrow" key={q.id}>
            <span>{q.content}</span>
            <span className="qmeta">
              <span className="mut">por {q.created_by ? names.get(q.created_by) ?? "alguien" : "alguien"}</span>
              {(q.created_by === me.id || isHost) && !used.has(q.id) && (
                <button className="linkbtn danger" disabled={party.busy === "delq"}
                  onClick={() => {
                    if (window.confirm("¿Borrar esta pregunta?")) party.deleteQuestion(q.id);
                  }}>
                  Borrar
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {isHost ? (
        <div className="card">
          <b>Empezar</b>
          <p className="mut" style={{ marginTop: 6 }}>
            {members.length < 2
              ? "Necesitas al menos 2 jugadores en la sala."
              : `Todo listo con ${members.length} jugadores.`}
          </p>
          <button className="btn full" disabled={members.length < 2 || party.busy === "start"}
            onClick={party.startGame}>
            {party.busy === "start" ? "Iniciando…" : "Iniciar partida"}
          </button>
        </div>
      ) : (
        <div className="card center">
          <span className="badge">Sala de espera</span>
          <p className="mut" style={{ marginTop: 10 }}>
            Esperando a que <b className="ink">{hostName}</b> inicie la partida…
          </p>
          <p className="mut" style={{ fontSize: ".82rem", marginTop: 6 }}>
            Mientras esperas puedes añadir tus propias preguntas arriba.
          </p>
        </div>
      )}

      {confirmLeave ? (
        <div className="card">
          <b>¿Abandonar la sala?</b>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setConfirmLeave(false)}>Cancelar</button>
            <button className="btn" onClick={party.leaveRoom} disabled={party.busy === "leave"}>Sí, salir</button>
          </div>
        </div>
      ) : (
        <button className="linkbtn danger centerblock" onClick={() => setConfirmLeave(true)}>
          Abandonar sala
        </button>
      )}
    </main>
  );
}
