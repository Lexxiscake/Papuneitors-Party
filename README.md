# Papuneitors Party

Juego de fiesta para jugar con amigos: se crean salas, todos votan “quién encaja mejor”
con cada pregunta y al final hay ranking. La app está conectada a **Supabase** (Auth,
Postgres, RLS y Realtime) y lista para desplegar en **Vercel**.

## 1. Configurar Supabase

1. Entra a tu proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor** → New query: ejecuta las migraciones de `supabase/migrations/`
   **en orden** (o `supabase db push` si usas la CLI). Cada una es idempotente.
3. En otra consulta ejecuta `supabase/seed.sql` (418 preguntas). Puedes repetirlo sin
   duplicar: las preguntas usan `on conflict do nothing`.

> **Si ya habías ejecutado el seed anterior**, vuelve a ejecutar `supabase/seed.sql` para
> añadir las preguntas nuevas (las que ya existen no se duplican).
4. Ve a **Project Settings → API** y copia:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable key** (o `anon public`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   La URL tiene la forma `https://<project-ref>.supabase.co`. El `<project-ref>` también
   aparece en la barra del navegador: `supabase.com/dashboard/project/<project-ref>`.

> La **secret key** / `service_role` **no** se usa en el frontend ni debe subirse a este
> repo. Si la compartiste por chat, rótala en **Project Settings → API Keys**.

### Correo de confirmación (recomendado para fiestas)

Por defecto Supabase pide confirmar el correo al registrarse, lo que hace lento entrar
desde el celular. Para que la gente entre directo:

**Authentication → Sign In / Providers → Email** → desactiva **Confirm email**.

Si prefieres dejarlo activo, la app muestra el aviso “revisa tu correo” y funciona igual.

### Realtime

La migración ya agrega las tablas a la publicación `supabase_realtime`. La app además
hace un sondeo cada 6 segundos como respaldo, así que funciona incluso si Realtime no
está activo.

### Intensidad progresiva

Cada pregunta tiene un nivel de 1 a 4 y la partida sube de tono sola: 🟢 20% inicial,
🟡 25%, 🟠 30% y 🔴 25% final. El nivel se calcula en la base de datos
(`public._guess_intensity`) también para las preguntas que añaden los jugadores, y sigue
sin repetirse ninguna pregunta dentro de la sala. En una partida de 4 rondas se juega un
nivel de cada uno.

### Opcional: expirar salas abandonadas

Activa la extensión **pg_cron** (Database → Extensions) y ejecuta:

```sql
select cron.schedule('expirar-salas', '*/30 * * * *', $$select public.expire_stale_rooms(6)$$);
```

## 2. Ejecutar en local

Necesitas Node 20 o superior.

```bash
npm install
npm run dev
```

Abre http://localhost:3000.

`.env.local` ya está configurado con la URL y la clave publishable de este proyecto.
Si cambias de proyecto, actualiza ambas variables y reinicia el servidor.

## 3. Desplegar en Vercel

1. Sube el proyecto a GitHub (o usa `npx vercel` con tu cuenta).
2. Entra a [vercel.com/new](https://vercel.com/new) e importa el repositorio.
3. En **Environment Variables** agrega, para Production, Preview y Development:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://xxxxxxxx.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_...`
4. Deploy. Vercel detecta Next.js automáticamente (no hace falta `vercel.json`).
5. Copia la URL final (ej. `https://papuneitors-party.vercel.app`) y configúrala en
   Supabase → **Authentication → URL Configuration**:
   - **Site URL**: tu URL de Vercel
   - **Redirect URLs**: agrega la misma URL

Con eso ya puedes crear salas reales, invitar por código y jugar desde varios celulares
a la vez.

### Alternativa por CLI

Si prefieres desplegar desde la terminal:

```bash
npx vercel login
npx vercel          # despliegue de prueba
npx vercel --prod   # producción
```

Recuerda agregar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en
**Project → Settings → Environment Variables** antes del build de producción.

## Estructura

- `src/app/page.tsx` — decide qué pantalla mostrar (auth, inicio, lobby, partida, final).
- `src/lib/useParty.ts` — sesión, sala, Realtime, sondeo y todas las llamadas RPC.
- `src/lib/lineup.ts` — los papuneitors (22): únicos nombres por los que se puede votar.
- `src/lib/intensity.ts` — niveles 🟢🟡🟠🔴 y sus etiquetas.
- `src/lib/supabase.ts` — cliente de Supabase (clave publishable).
- `src/components/` — pantallas de la interfaz.
- `supabase/migrations/` — esquema, RLS, funciones del juego y Realtime.
- `supabase/seed.sql` — banco de preguntas predeterminadas.

## Notas de seguridad

- Las contraseñas y correos viven en `auth.users`; el cliente solo lee `public.profiles`.
- Las votaciones son secretas hasta que la ronda se revela (RLS en `answers`).
- Toda escritura pasa por funciones RPC con validaciones y permisos por rol.
- La clave publishable puede estar en el navegador: RLS impide leer o escribir de más.
