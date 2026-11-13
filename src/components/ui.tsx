"use client";

export const Avatar = ({ n, s = 34 }: { n: string; s?: number }) => (
  <span className="av" style={{ width: s, height: s, fontSize: Math.round(s * 0.45) }}>
    {(n?.[0] ?? "?").toUpperCase()}
  </span>
);

export const Brand = () => (
  <h1 className="brand">
    Papuneitors <span>Party</span>
  </h1>
);

export const Splash = () => (
  <main>
    <Brand />
    <div className="card center">
      <span className="badge">Cargando</span>
      <p className="mut" style={{ marginTop: 10 }}>Un segundo…</p>
    </div>
  </main>
);

export const Banners = ({
  error,
  notice,
  onClearError,
  onClearNotice,
}: {
  error: string;
  notice: string;
  onClearError: () => void;
  onClearNotice: () => void;
}) => (
  <>
    {error && (
      <div className="banner bad" role="alert">
        <span>{error}</span>
        <button className="x" onClick={onClearError} aria-label="Cerrar aviso">×</button>
      </div>
    )}
    {notice && (
      <div className="banner ok" role="status">
        <span>{notice}</span>
        <button className="x" onClick={onClearNotice} aria-label="Cerrar aviso">×</button>
      </div>
    )}
  </>
);

export const ConfigScreen = () => (
  <main>
    <Brand />
    <p className="mut">El juego donde tus amigos te conocen demasiado.</p>
    <div className="card">
      <b>Falta conectar Supabase</b>
      <p className="mut" style={{ marginTop: 8 }}>
        Crea un archivo <code>.env.local</code> en la raíz del proyecto con estas dos variables:
      </p>
      <pre className="codeblock">{`NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-publishable`}</pre>
      <p className="mut" style={{ marginTop: 10 }}>
        En Supabase están en <b>Project Settings → API</b>. Después reinicia con
        <code> npm run dev</code>.
      </p>
    </div>
    <div className="card">
      <b>¿Ya tienes la URL?</b>
      <p className="mut" style={{ marginTop: 8 }}>
        Se ve así: <code>https://abcdefghijkl.supabase.co</code>. Es distinta de las claves que ya
        tienes: sale arriba en la misma pantalla de API.
      </p>
      <p className="mut" style={{ marginTop: 8 }}>
        Truco: abre tu proyecto en Supabase y mira la barra del navegador. Si dice
        <code> supabase.com/dashboard/project/abcdefghijkl</code>, entonces tu URL es
        <code> https://abcdefghijkl.supabase.co</code>.
      </p>
    </div>
  </main>
);
