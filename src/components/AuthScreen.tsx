"use client";

import { useState } from "react";
import type { Party } from "../lib/useParty";
import { Brand } from "./ui";

export function AuthScreen({ party }: { party: Party }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [localErr, setLocalErr] = useState("");

  const busy = party.busy === "auth";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr("");
    if (!email.includes("@") || email.trim().length < 5) {
      setLocalErr("Escribe un correo válido.");
      return;
    }
    if (password.length < 8) {
      setLocalErr("La contraseña necesita al menos 8 caracteres.");
      return;
    }
    if (mode === "register") {
      await party.signUp(username, email, password);
    } else {
      await party.signIn(email, password);
    }
  }

  return (
    <main>
      <Brand />
      <p className="mut">El juego donde tus amigos te conocen demasiado.</p>

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "login"}
          className={mode === "login" ? "on" : ""}
          onClick={() => { setMode("login"); setLocalErr(""); party.clearError(); }}
        >
          Iniciar sesión
        </button>
        <button
          role="tab"
          aria-selected={mode === "register"}
          className={mode === "register" ? "on" : ""}
          onClick={() => { setMode("register"); setLocalErr(""); party.clearError(); }}
        >
          Crear cuenta
        </button>
      </div>

      <form className="card" onSubmit={submit}>
        {mode === "register" && (
          <label className="field">
            Nombre de usuario
            <input
              maxLength={20}
              autoComplete="username"
              placeholder="Como te conocen tus amigos"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <small className="hint">Entre 2 y 20 caracteres. Es el nombre que verán los demás.</small>
          </label>
        )}
        <label className="field">
          Correo
          <input
            type="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          Contraseña
          <div className="pw">
            <input
              type={show ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="button" className="eye" onClick={() => setShow((s) => !s)}>
              {show ? "Ocultar" : "Ver"}
            </button>
          </div>
        </label>

        <p className="err" role="alert">{localErr}</p>

        <button className="btn full" disabled={busy}>
          {busy ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta y entrar"}
        </button>

        <p className="mut" style={{ marginTop: 12, fontSize: ".83rem" }}>
          {mode === "login" ? (
            <>¿Primera vez? Toca <b>Crear cuenta</b>.</>
          ) : (
            <><b>Importante:</b> el correo debe estar confirmado. Si no te llega el correo,
            pídele al anfitrión que desactive la confirmación en Supabase (Authentication → Sign In / Providers).</>
          )}
        </p>
      </form>

      <p className="mut center" style={{ marginTop: 18, fontSize: ".82rem" }}>
        Tus correos y contraseñas los guarda Supabase Auth. Nunca se muestran al resto.
      </p>
    </main>
  );
}
