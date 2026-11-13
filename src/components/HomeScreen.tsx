"use client";

import { useState } from "react";
import type { Party } from "../lib/useParty";
import { Avatar, Brand } from "./ui";

export function HomeScreen({ party }: { party: Party }) {
  const me = party.profile!;
  const [rounds, setRounds] = useState(8);
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [uncomfortable, setUncomfortable] = useState(true);
  const [joinCode, setJoinCode] = useState("");

  return (
    <main>
      <div className="row toprow">
        <Brand />
        <div className="row" style={{ gap: 8 }}>
          <Avatar n={me.username} s={38} />
          <button className="btn ghost" onClick={party.signOut}>Cerrar sesión</button>
        </div>
      </div>
      <p className="mut">Hola, <b className="ink">{me.username}</b>. Crea una sala o únete con un código.</p>

      {party.activeRooms.length > 0 && (
        <div className="card">
          <b>Tus salas activas</b>
          <p className="mut" style={{ marginTop: 6 }}>
            Sigues dentro de estas salas. Entra para continuar o abandónalas desde dentro.
          </p>
          {party.activeRooms.map((r) => (
            <div className="rank" key={r.id}>
              <span className="pos" aria-hidden="true">{r.status === "playing" ? "🎮" : "🕓"}</span>
              <span className="ellipsis">
                <b>{r.code}</b>{" "}
                <span className="mut">· {r.status === "playing" ? "en partida" : "en lobby"}</span>
              </span>
              <button className="btn ghost" onClick={() => party.openRoom(r.id)}>Entrar</button>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <b>Crear sala</b>
        <p className="mut" style={{ marginTop: 6 }}>Tú eres el anfitrión y controlas el ritmo de la partida.</p>

        <label className="field">
          <span className="spread"><span>Rondas</span><b>{rounds}</b></span>
          <input type="range" min={4} max={15} step={1} value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))} />
        </label>

        <label className="field">
          <span className="spread"><span>Jugadores máximos</span><b>{maxPlayers}</b></span>
          <input type="range" min={2} max={20} step={1} value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))} />
        </label>

        <label className="switch">
          <input type="checkbox" checked={uncomfortable} onChange={(e) => setUncomfortable(e.target.checked)} />
          <span className="track" aria-hidden="true"><span /></span>
          <span>
            Incluir preguntas incómodas
            <small className="hint">Si lo apagas, se evitan las preguntas marcadas como incómodas. Aun así el juego es picante.</small>
          </span>
        </label>

        <button className="btn full" disabled={party.busy === "create"}
          onClick={() => party.createRoom(maxPlayers, rounds, uncomfortable)}>
          {party.busy === "create" ? "Creando…" : "Crear sala"}
        </button>
      </div>

      <div className="card">
        <b>Unirse con código</b>
        <label className="field">
          Código de sala
          <input
            maxLength={6}
            autoComplete="off"
            placeholder="K7P2QX"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") party.joinRoom(joinCode); }}
            style={{ textTransform: "uppercase", letterSpacing: ".18em", fontWeight: 800 }}
          />
        </label>
        <button className="btn full" disabled={party.busy === "join" || joinCode.length !== 6}
          onClick={() => party.joinRoom(joinCode)}>
          {party.busy === "join" ? "Entrando…" : "Unirse a la sala"}
        </button>
      </div>

      <div className="card">
        <b>Cómo se juega</b>
        <ol className="steps">
          <li>El anfitrión crea la sala y comparte el código de 6 caracteres.</li>
          <li>Todos entran y pueden añadir sus propias preguntas.</li>
          <li>Cada ronda lees la pregunta y votas por quien mejor encaje.</li>
          <li>Al revelar se ven los votos. Gana quien acumule más rondas.</li>
        </ol>
        <p className="mut" style={{ marginTop: 10, fontSize: ".82rem" }}>
          Aviso: hay preguntas picantes y ofensivas. Juega con gente que aguante el roast.
        </p>
      </div>
    </main>
  );
}
