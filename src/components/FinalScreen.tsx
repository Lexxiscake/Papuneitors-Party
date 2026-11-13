"use client";

import { useMemo } from "react";
import type { Party } from "../lib/useParty";
import { sameName } from "../lib/lineup";
import { Avatar, Brand } from "./ui";

export function FinalScreen({ party }: { party: Party }) {
  const me = party.profile!;
  const s = party.snapshot!;
  const { room, rounds, answers } = s;

  const perRound = useMemo(
    () =>
      [...rounds]
        .sort((a, b) => a.round_number - b.round_number)
        .map((round) => {
          const roundAnswers = answers.filter((a) => a.round_id === round.id);
          const counts = new Map<string, number>();
          roundAnswers.forEach((a) =>
            counts.set(a.selected_name, (counts.get(a.selected_name) ?? 0) + 1),
          );
          const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
          const max = rows[0]?.[1] ?? 0;
          return {
            round,
            votes: roundAnswers.length,
            winners: rows.filter((r) => r[1] === max && r[1] > 0).map((r) => r[0]),
          };
        }),
    [rounds, answers],
  );

  const ranking = useMemo(() => {
    const wins = new Map<string, number>();
    perRound.forEach((r) => r.winners.forEach((name) => wins.set(name, (wins.get(name) ?? 0) + 1)));
    return [...wins.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [perRound]);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <main>
      <div className="row toprow">
        <Brand />
        <button className="btn ghost" onClick={party.signOut}>Cerrar sesión</button>
      </div>

      <div className="card center">
        <span className="badge">Sala {room.code}</span>
        <h2 className="title2">Fin de la partida</h2>
        <p className="mut">
          {rounds.length} {rounds.length === 1 ? "ronda jugada" : "rondas jugadas"}.
          El ranking cuenta las rondas ganadas.
        </p>
      </div>

      <div className="card">
        <b>Ranking</b>
        {ranking.length === 0 ? (
          <p className="mut" style={{ marginTop: 8 }}>No hubo votos en esta partida.</p>
        ) : (
          ranking.map((row, i) => (
            <div className="rank" key={row.name}>
              <span className="pos">{i < 3 ? medals[i] : i + 1}</span>
              <Avatar n={row.name} s={32} />
              <span className="ellipsis">
                {row.name}
                {sameName(row.name, me.username) && <span className="mut"> (tú)</span>}
              </span>
              <b>{row.count} {row.count === 1 ? "ronda" : "rondas"}</b>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <b>Ronda por ronda</b>
        {perRound.length === 0 && <p className="mut" style={{ marginTop: 8 }}>Sin rondas.</p>}
        {perRound.map(({ round, winners, votes }) => (
          <div className="summary" key={round.id}>
            <span className="mut rnum">R{round.round_number}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="squestion">{round.questions?.content ?? "Pregunta"}</p>
              <p className="mut" style={{ fontSize: ".82rem" }}>
                {winners.length
                  ? `Ganó ${winners.join(" y ")} con ${votes} ${votes === 1 ? "voto" : "votos"}`
                  : "Sin votos"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {room.host_id === me.id ? (
        <>
          <button
            className="btn full"
            disabled={party.busy === "restart"}
            onClick={party.restartGame}
          >
            {party.busy === "restart" ? "Preparando…" : "Jugar otra sesión"}
          </button>
          <p className="mut center" style={{ marginTop: 8, fontSize: ".82rem" }}>
            Vuelve al lobby con el mismo código y los mismos jugadores. Las preguntas ya usadas no se
            repiten.
          </p>
          <button className="btn ghost full" style={{ marginTop: 10 }} onClick={party.goHome}>
            Volver al inicio
          </button>
        </>
      ) : (
        <>
          <button className="btn full" onClick={party.goHome}>Volver al inicio</button>
          <p className="mut center" style={{ marginTop: 10, fontSize: ".82rem" }}>
            El anfitrión puede iniciar otra sesión con el mismo código. Las preguntas ya usadas no se
            repiten.
          </p>
        </>
      )}
      <p className="mut center" style={{ marginTop: 14, fontSize: ".82rem" }}>
        La sala quedó guardada. Puedes volver a entrar con el código {room.code} mientras siga activa.
      </p>
    </main>
  );
}
