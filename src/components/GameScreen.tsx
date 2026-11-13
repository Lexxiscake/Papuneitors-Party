"use client";

import { useMemo, useState } from "react";
import type { Answer, Round, RoundPlayer } from "../lib/types";
import type { Party } from "../lib/useParty";
import { LINEUP, sameName, searchLineup } from "../lib/lineup";
import { Avatar, Brand } from "./ui";

const CATEGORY_LABEL: Record<string, string> = {
  incomodas: "incómoda",
  caoticas: "caótica",
  graciosas: "graciosa",
  amistad: "amistad",
  personalidad: "personalidad",
  aleatorias: "de la sala",
};

function voterNames(players: RoundPlayer[], members: { user_id: string; profiles: { username: string } | null }[]) {
  const map = new Map<string, string>();
  members.forEach((m) => map.set(m.user_id, m.profiles?.username ?? "Jugador"));
  players.forEach((p) => map.set(p.user_id, p.profiles?.username ?? "Jugador"));
  return map;
}

function tally(answers: Answer[]) {
  const counts = new Map<string, number>();
  answers.forEach((a) => counts.set(a.selected_name, (counts.get(a.selected_name) ?? 0) + 1));
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] ?? 0;
  return { rows, max, total: answers.length, winners: rows.filter((r) => r[1] === max).map((r) => r[0]) };
}

export function GameScreen({ party }: { party: Party }) {
  const me = party.profile!;
  const s = party.snapshot!;
  const { room, rounds, roundPlayers, answers, members } = s;
  const round = rounds[rounds.length - 1];
  const total = room.settings.total_rounds ?? 8;
  const isHost = room.host_id === me.id;
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (!round) {
    return (
      <main>
        <Brand />
        <div className="card center">
          <div className="spinner" aria-hidden="true" />
          <p className="mut" style={{ marginTop: 10 }}>Preparando la primera ronda…</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="row toprow">
        <Brand />
        <button className="btn ghost" onClick={party.signOut}>Cerrar sesión</button>
      </div>

      <div className="row">
        <b>Ronda {round.round_number} de {total}</b>
        <span className="mut">Sala {room.code}</span>
      </div>
      <div className="prog">
        <div style={{ width: `${Math.min(100, (round.round_number / total) * 100)}%` }} />
      </div>

      <div className="card qcard">
        <span className="badge">{CATEGORY_LABEL[round.questions?.category ?? ""] ?? "pregunta"}</span>
        <p className="qtext">{round.questions?.content ?? "Pregunta no disponible"}</p>
      </div>

      {round.status === "voting" ? (
        <VoteView
          key={round.id}
          party={party}
          round={round}
          answers={answers}
          isHost={isHost}
          playersInRound={roundPlayers.filter((p) => p.round_id === round.id)}
        />
      ) : (
        <RevealView
          key={round.id}
          round={round}
          players={roundPlayers}
          answers={answers}
          members={members}
          isHost={isHost}
          totalRounds={total}
          busy={party.busy}
          onNext={party.nextRound}
        />
      )}

      {confirmLeave ? (
        <div className="card">
          <b>¿Abandonar la partida?</b>
          <p className="mut" style={{ marginTop: 6 }}>Tu voto de esta ronda se perderá si aún no lo enviaste.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setConfirmLeave(false)}>Cancelar</button>
            <button className="btn" onClick={party.leaveRoom} disabled={party.busy === "leave"}>Sí, salir</button>
          </div>
        </div>
      ) : (
        <button className="linkbtn danger centerblock" onClick={() => setConfirmLeave(true)}>Abandonar sala</button>
      )}
    </main>
  );
}

function VoteView({
  party,
  round,
  playersInRound,
  answers,
  isHost,
}: {
  party: Party;
  round: Round;
  answers: Answer[];
  isHost: boolean;
  playersInRound: RoundPlayer[];
}) {
  const [term, setTerm] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const meName = party.profile?.username ?? "";
  const voted = playersInRound.filter((p) => p.has_voted).length;
  const totalVoters = playersInRound.length;
  const myAnswer = answers.find((a) => a.round_id === round.id && a.voter_id === party.profile?.id);
  const myTargetName = myAnswer?.selected_name ?? "un papuneitor";
  const busy = party.busy === "vote";

  const results = useMemo(() => searchLineup(term), [term]);
  const showList = !myAnswer && !sel && term.trim().length > 0;
  const noMatch = !myAnswer && !sel && term.trim().length > 0 && results.length === 0;

  return (
    <div className="card">
      <div className="row">
        <span className="mut">Votos enviados</span>
        <b>{voted} de {totalVoters}</b>
      </div>
      <div className="prog">
        <div style={{ width: `${totalVoters ? (voted / totalVoters) * 100 : 0}%` }} />
      </div>

      {myAnswer ? (
        <div className="chosenbox">
          <span className="check" aria-hidden="true">✓</span>
          <div>
            <b>Voto enviado</b>
            <p className="mut">
              Elegiste a <b className="ink">{myTargetName}</b>. Esperando a los demás…
            </p>
          </div>
          <div className="spinner" aria-hidden="true" />
        </div>
      ) : (
        <>
          <div className="field" style={{ marginTop: 14 }}>
            <span>¿Quién es?</span>
            <div className="combo" style={{ marginTop: 6 }}>
              <input
                role="combobox"
                aria-expanded={!!showList && results.length > 0}
                aria-controls="resultados"
                autoComplete="off"
                autoFocus
                placeholder="Escribe un nombre"
                value={sel ?? term}
                onChange={(e) => { setTerm(e.target.value); if (sel) setSel(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!sel && results.length) setSel(results[0]);
                    else if (sel) party.submitVote(sel);
                  }
                }}
                disabled={!!sel}
              />
              {sel && (
                <button type="button" className="eye" onClick={() => { setSel(null); setTerm(""); }}>
                  Cambiar
                </button>
              )}
              {showList && results.length > 0 && (
                <ul id="resultados" role="listbox">
                  {results.map((name) => (
                    <li key={name} role="option" aria-selected={false} onClick={() => { setSel(name); setTerm(name); }}>
                      <Avatar n={name} s={28} />
                      <span className="ellipsis">{name}{sameName(name, meName) && " (tú)"}</span>
                    </li>
                  ))}
                </ul>
              )}
              {noMatch && (
                <p className="mut" style={{ marginTop: 8 }}>Ninguno de los {LINEUP.length} papuneitors se llama así.</p>
              )}
            </div>
          </div>

          {term.trim().length === 0 && (
            <div className="chips">
              {LINEUP.map((name) => (
                <button key={name} className="chip" onClick={() => { setSel(name); setTerm(name); }}>
                  <Avatar n={name} s={24} />{name}{sameName(name, meName) && " (tú)"}
                </button>
              ))}
            </div>
          )}

          <p className="chosen">{sel ? `Elegiste a ${sel}` : ""}</p>
          <button className="btn full" disabled={!sel || busy} onClick={() => sel && party.submitVote(sel)}>
            {busy ? "Enviando…" : "Confirmar voto"}
          </button>
          <p className="mut" style={{ marginTop: 10, fontSize: ".84rem" }}>
            Solo puedes votar por uno de los {LINEUP.length} papuneitors, esté o no en la sala. No se
            puede cambiar después de confirmar.
          </p>
        </>
      )}

      {isHost && voted > 0 && (
        <button className="btn ghost full" style={{ marginTop: 12 }} disabled={party.busy === "reveal"}
          onClick={party.forceReveal}>
          {party.busy === "reveal" ? "Revelando…" : "Revelar ahora (anfitrión)"}
        </button>
      )}
    </div>
  );
}

function RevealView({
  round,
  players,
  answers,
  members,
  isHost,
  totalRounds,
  busy,
  onNext,
}: {
  round: Round;
  players: RoundPlayer[];
  answers: Answer[];
  members: { user_id: string; profiles: { username: string } | null }[];
  isHost: boolean;
  totalRounds: number;
  busy: string | null;
  onNext: () => void;
}) {
  const roundAnswers = answers.filter((a) => a.round_id === round.id);
  const names = voterNames(players, members);
  const r = tally(roundAnswers);
  const last = round.round_number >= totalRounds;

  return (
    <>
      {r.total === 0 ? (
        <div className="hero">
          <div className="who">Nadie votó</div>
          <div className="mut">Esta ronda quedó sin votos.</div>
        </div>
      ) : (
        <div className="hero">
          <div className="crown" aria-hidden="true">👑</div>
          <div className="who">{r.winners.join(" y ")}</div>
          <div className="mut">
            {r.max} {r.max === 1 ? "voto" : "votos"}{r.winners.length > 1 && " cada uno (empate)"}
          </div>
        </div>
      )}

      {r.total > 0 && (
        <div className="card">
          <b>Resultados</b>
          {r.rows.map(([name, v]) => (
            <div className="bar" key={name}>
              <span className="bn">{name}</span>
              <div className="tr"><div className="fl lit" style={{ width: `${(v / r.max) * 100}%` }} /></div>
              <b>{v} ({Math.round((v / r.total) * 100)}%)</b>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <b>Quién votó por quién</b>
        <div className="votes">
          {roundAnswers.map((a) => {
            const voter = names.get(a.voter_id) ?? "Alguien";
            const self = sameName(a.selected_name, voter);
            return (
              <div className="vt" key={a.voter_id}>
                <b>{voter}</b> {self ? "se votó a sí mismo" : `votó por ${a.selected_name}`}
              </div>
            );
          })}
        </div>
      </div>

      {isHost ? (
        <button className="btn full" disabled={busy === "next"} onClick={onNext}>
          {busy === "next" ? "Cargando…" : last ? "Ver resumen final" : "Siguiente ronda"}
        </button>
      ) : (
        <div className="card center">
          <div className="spinner" aria-hidden="true" />
          <p className="mut" style={{ marginTop: 10 }}>Esperando a que el anfitrión continúe…</p>
        </div>
      )}
    </>
  );
}
