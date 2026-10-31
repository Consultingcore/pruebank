# Núcleo Kokón — Fases 1 a 3

Node.js + Express · HTML/CSS/JS puro · SQL Server (paquete `mssql`, consultas parametrizadas).

| Fase | Qué incluye |
|---|---|
| 1 | Esquema SQL Server, registro, login, recuperación de contraseña, Google OAuth, JWT y roles (`admin`, `member`, `free`) |
| 2 | Diseño minimalista: paleta tierra/azul/blanco roto, semáforo 🔴🟡🟢🔵, transiciones tipo slide, menú deslizable |
| 3 | Dashboard con 3 slides: prioridades (máx. 4, según el índice), frases ancla, check-ins (máx. 4/día) con foto y anillos concéntricos |

## Puesta en marcha

```bash
npm install
cp .env.example .env        # completa DB_*, JWT_SECRET y (opcional) GOOGLE_CLIENT_ID
npm run db:init             # crea la BD y las tablas (idempotente)
npm run create-admin -- tu@correo.com "UnaClaveSegura123"
npm start                   # http://localhost:3000
```

SQL Server de prueba con Docker:

```bash
docker run -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD='TuPassword_Seguro1' -p 1433:1433 -d mcr.microsoft.com/mssql/server:2022-latest
```

Comprueba la conexión en `http://localhost:3000/api/health`.

## Google OAuth
1. Google Cloud Console → Credenciales → ID de cliente OAuth (aplicación web).
2. Orígenes autorizados: `http://localhost:3000` y tu dominio.
3. Copia el ID en `GOOGLE_CLIENT_ID`. El botón aparece solo cuando está configurado.

## Recuperación de contraseña
Sin `SMTP_*`, en desarrollo el enlace se imprime en la consola y se muestra en pantalla. En producción configura SMTP; el enlace nunca se devuelve al cliente.

## Cal.com
Con `CAL_API_KEY`, los webinars/mentorías del día se inyectan como prioridad #1. **Valida la ruta y la versión de la API en la documentación vigente de Cal.com** (`src/services/calcom.js`). Si falla, el dashboard sigue funcionando.

## Reglas de sostenibilidad (`src/services/sustainability.js`)
- Índice = promedio de los check-ins de los últimos 7 días (escala 1–5 → 0–100).
- Prioridades sugeridas: índice < 40 → 2 · 40–69 → 3 · ≥ 70 → 4.
- Semáforo: < 25 🔴 · < 50 🟡 · < 75 🟢 · ≥ 75 🔵.
- Anillos: Cuerpo, Emoción, Operativo (incluye % de prioridades completadas) y Enfoque.
Son valores iniciales para validar con la facilitadora.

## Estructura
```
db/schema.sql            Esquema T-SQL (Users, Profiles, Priorities, CheckIns, Bitacoras, Materials, Community, AnchorPhrases)
src/routes/              auth · priorities · checkins · dashboard
src/services/            sustainability · calcom · mailer
public/                  index.html (acceso) · app.html (dashboard) · css · js
```

## Decisiones a tener presentes
- **Anillos:** se dibujan con SVG puro porque no se usa React en esta versión. Recharts entra si se migra el frontend.
- **ORM:** se usa `mssql` con SQL parametrizado; Prisma/TypeORM pueden añadirse sin cambiar el esquema.
- **Token:** vive en `localStorage` (simple). Para endurecer, migrar a cookie `httpOnly` + CSRF.
- **Pendiente:** pagos (MercadoPago/PayPal), restricciones por rol en Materiales, Bitácora, Comunidad y PWA (manifest + service worker).
