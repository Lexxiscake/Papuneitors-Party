"use client";

import { useEffect, useMemo, useState } from "react";
import type { Answer, Profile, Round, RoundPlayer } from "../lib/types";
import type { Party } from "../lib/useParty";
import { supabase } from "../lib/supabase";
import { Avatar, Brand } from "./ui";

const CATEGORY_LABEL: Record<string, string> = {
  incomodas: "incómoda",
  caoticas: "caótica",
  graciosas: "graciosa",
  amistad: "amistad",
  personalidad: "personalidad",
  aleatorias: "de la sala",
};

function namesFor(round: Round, players: RoundPlayer[], answers: Answer[], members: { user_id: string; profiles: { username: string } | null }[]) {
  const map = new Map<string, string>();
  members.forEach((m) => map.set(m.user_id, m.profiles?.username ?? "Jugador"));
  players.filter((p) => p.round_id === round.id).forEach((p) => map.set(p.user_id, p.profiles?.username ?? "Jugador"));
  answers.filter((a) => a.round_id === round.id).forEach((a) => {
    if (a.target?.username) map.set(a.selected_user_id, a.target.username);
  });
  return map;
}

function tally(answers: Answer[]) {
  const counts = new Map<string, number>();
  answers.forEach((a) => counts.set(a.selected_user_id, (counts.get(a.selected_user_id) ?? 0) + 1));
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
          players={roundPlayers}
          answers={answers}
          meId={me.id}
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
  meId,
  isHost,
}: {
  party: Party;
  round: Round;
  players: RoundPlayer[];
  answers: Answer[];
  meId: string;
  isHost: boolean;
  playersInRound: RoundPlayer[];
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [sel, setSel] = useState<Profile | null>(null);
  const [searching, setSearching] = useState(false);

  const voted = playersInRound.filter((p) => p.has_voted).length;
  const totalVoters = playersInRound.length;
  const myAnswer = answers.find((a) => a.round_id === round.id && a.voter_id === meId);
  const myTarget = myAnswer ? playersInRound.find((p) => p.user_id === myAnswer.selected_user_id) : null;
  const myTargetName = myTarget?.profiles?.username ?? myAnswer?.target?.username ?? "un jugador";
  const busy = party.busy === "vote";

  const quick = useMemo(
    () =>
      playersInRound.map((p) => ({
        id: p.user_id,
        username: p.profiles?.username ?? "Jugador",
        avatar: p.profiles?.avatar ?? null,
      })),
    [playersInRound],
  );

  const idsKey = quick.map((q) => q.id).join(",");

  useEffect(() => {
    let active = true;
    const cleaned = term.trim().replace(/[%_,()]/g, " ").trim();

    if (!cleaned) {
      setResults(quick);
      setSearching(false);
      return () => { active = false; };
    }

    setSearching(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase()
        .from("profiles")
        .select("id,username,avatar")
        .ilike("username", `%${cleaned}%`)
        .order("username")
        .limit(10);
      if (!active) return;
      if (error) console.error(error);
      setResults((data ?? []) as Profile[]);
      setSearching(false);
    }, 220);

    return () => { active = false; clearTimeout(t); };
  }, [term, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const showList = !myAnswer && !sel && term.trim().length > 0 && results.length > 0;

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
                aria-expanded={showList}
                aria-controls="resultados"
                autoComplete="off"
                autoFocus
                placeholder="Escribe un nombre"
                value={sel ? sel.username : term}
                onChange={(e) => { setTerm(e.target.value); if (sel) setSel(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!sel && results.length) setSel(results[0]);
                    else if (sel) party.submitVote(sel.id);
                  }
                }}
                disabled={!!sel}
              />
              {sel && (
                <button type="button" className="eye" onClick={() => { setSel(null); setTerm(""); }}>
                  Cambiar
                </button>
              )}
              {showList && (
                <ul id="resultados" role="listbox">
                  {results.map((p) => (
                    <li key={p.id} role="option" aria-selected={false} onClick={() => { setSel(p); setTerm(p.username); }}>
                      <Avatar n={p.username} s={28} />
                      <span className="ellipsis">{p.username}{p.id === meId && " (tú)"}</span>
                    </li>
                  ))}
                </ul>
              )}
              {searching && <p className="mut" style={{ marginTop: 8 }}>Buscando…</p>}
              {!searching && term.trim().length > 0 && results.length === 0 && !sel && (
                <p className="mut" style={{ marginTop: 8 }}>Ningún jugador con ese nombre.</p>
              )}
            </div>
          </div>

          {term.trim().length === 0 && (
            <div className="chips">
              {quick.map((p) => (
                <button key={p.id} className="chip" onClick={() => { setSel(p); setTerm(p.username); }}>
                  <Avatar n={p.username} s={24} />{p.username}{p.id === meId && " (tú)"}
                </button>
              ))}
            </div>
          )}

          <p className="chosen">{sel ? `Elegiste a ${sel.username}` : ""}</p>
          <button className="btn full" disabled={!sel || busy} onClick={() => sel && party.submitVote(sel.id)}>
            {busy ? "Enviando…" : "Confirmar voto"}
          </button>
          <p className="mut" style={{ marginTop: 10, fontSize: ".84rem" }}>
            Puedes votar por cualquier usuario registrado, aunque no esté en la sala. No se puede
            cambiar después de confirmar.
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
  const names = namesFor(round, players, answers, members);
  const r = tally(roundAnswers);
  const last = round.round_number >= totalRounds;
  const winnerNames = r.winners.map((id) => names.get(id) ?? "Alguien");

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
          <div className="who">{winnerNames.join(" y ")}</div>
          <div className="mut">
            {r.max} {r.max === 1 ? "voto" : "votos"}{r.winners.length > 1 && " cada uno (empate)"}
          </div>
        </div>
      )}

      {r.total > 0 && (
        <div className="card">
          <b>Resultados</b>
          {r.rows.map(([id, v]) => (
            <div className="bar" key={id}>
              <span className="bn">{names.get(id) ?? "Alguien"}</span>
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
            const target = names.get(a.selected_user_id) ?? a.target?.username ?? "Alguien";
            return (
              <div className="vt" key={a.voter_id}>
                <b>{voter}</b> {a.voter_id === a.selected_user_id ? "se votó a sí mismo" : `votó por ${target}`}
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
