"use client";

import { AuthScreen } from "../components/AuthScreen";
import { FinalScreen } from "../components/FinalScreen";
import { GameScreen } from "../components/GameScreen";
import { HomeScreen } from "../components/HomeScreen";
import { LobbyScreen } from "../components/LobbyScreen";
import { Banners, Brand, ConfigScreen, Splash } from "../components/ui";
import { isSupabaseConfigured } from "../lib/supabase";
import { useParty, type Party } from "../lib/useParty";

export default function Page() {
  const party = useParty();

  if (!isSupabaseConfigured) return <ConfigScreen />;

  return (
    <>
      <Banners
        error={party.error}
        notice={party.notice}
        onClearError={party.clearError}
        onClearNotice={party.clearNotice}
      />
      <Content party={party} />
      {party.reconnecting && <div className="net">Reconectando…</div>}
    </>
  );
}

function Content({ party }: { party: Party }) {
  if (!party.authReady) return <Splash />;
  if (!party.session) return <AuthScreen party={party} />;

  if (party.profileState === "missing") {
    return (
      <main>
        <Brand />
        <div className="card">
          <b>No encontramos tu perfil</b>
          <p className="mut" style={{ marginTop: 8 }}>
            Tu cuenta existe, pero falta la fila en <code>public.profiles</code>. Normalmente la crea
            un trigger al registrarte. Revisa que hayas ejecutado la migración completa.
          </p>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn ghost" onClick={party.signOut}>Cerrar sesión</button>
            <button className="btn" onClick={party.retryProfile}>Reintentar</button>
          </div>
        </div>
      </main>
    );
  }

  if (!party.profile) return <Splash />;
  if (party.restoringRoom && !party.snapshot) return <Splash />;
  if (!party.snapshot) return <HomeScreen party={party} />;

  const { room } = party.snapshot;

  if (room.status === "expired") {
    return (
      <main>
        <Brand />
        <div className="card">
          <b>Esta sala expiró</b>
          <p className="mut" style={{ marginTop: 8 }}>
            Pasó demasiado tiempo sin actividad. Crea una sala nueva y vuelve a invitar a tus amigos.
          </p>
          <button className="btn full" onClick={party.goHome}>Volver al inicio</button>
        </div>
      </main>
    );
  }

  if (room.status === "lobby") return <LobbyScreen party={party} />;
  if (room.status === "playing") return <GameScreen party={party} />;
  return <FinalScreen party={party} />;
}
