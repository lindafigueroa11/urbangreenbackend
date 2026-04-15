# Urban Green Backend

API REST para la app Urban Green: autenticación (PostgreSQL), sensores/dispositivos, clima, identificación de plantas (Gemini), zonas verdes en Hermosillo (OpenStreetMap / Overpass + opcional Geoapify y Foursquare) y fotos de parques vía Google Places.

## Stack

- **Node.js** 20.x
- **Express** 5
- **PostgreSQL** (`pg`) — usuarios, sesiones y tablas gestionadas al arranque
- **SQLite** (`sqlite3`) — datos locales según módulos que usen `src/config/database.js`
- **dotenv** — variables desde `.env` (copiar de [`.env.example`](./.env.example))

## Estructura principal

```
.
├── app.js                 # Express: middleware, montaje de rutas
├── server.js              # Arranque, migraciones auth/schema
├── db.js                  # Pool PostgreSQL (DATABASE_URL)
├── routes/                # Routers por dominio
│   ├── auth.js
│   ├── devices.js
│   ├── sensorData.js
│   ├── greenZones.js
│   ├── plants.js
│   ├── userPlants.js
│   └── weather.js
├── src/
│   ├── controllers/
│   ├── services/          # Lógica (p. ej. greenZoneService, plantInsights…)
│   └── ...
├── data/                  # Caché y datos locales (gitignored según .gitignore)
│   ├── hermosillo-green-zones.json   # caché Overpass (TTL en servicio)
│   └── park-google-place-ids.json    # mapeo zona → Google Place ID (fotos)
├── scripts/
│   ├── invalidate-green-zones-cache.js
│   └── build-park-google-place-ids.js
└── public/                # Página raíz, privacidad, términos
```

## Arranque local

```bash
npm install
cp .env.example .env   # Windows: copia manual; rellena DATABASE_URL, JWT_SECRET, etc.
npm run dev
```

Por defecto el servidor escucha en `http://localhost:3000` (o el `PORT` definido en `.env`).

## Scripts npm

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor con `dotenv` cargado |
| `npm start` | Producción (`node server.js`, sin dotenv; en hosting las env vienen del panel) |
| `npm run invalidate-green-zones-cache` | Borra `data/hermosillo-green-zones.json` (ver nota abajo) |
| `npm run build:place-ids` | Genera/actualiza `park-google-place-ids.json` (ver script) |
| `npm run check:google-env` | Comprueba que `.env` tenga `GOOGLE_WEB_CLIENT_ID` (OAuth Google) |

## Variables de entorno (resumen)

Ver [`.env.example`](./.env.example) para la lista completa. Destacadas:

| Variable | Uso |
|----------|-----|
| `PORT` | Puerto HTTP (Render lo inyecta) |
| `DATABASE_URL` | PostgreSQL (usuarios / datos que usen `db.js`) |
| `JWT_SECRET` | Tokens de sesión |
| `GOOGLE_WEB_CLIENT_ID` | Mismo Client ID OAuth **Web** que `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` en la app; requerido para `POST /auth/google` (checklist Google Cloud en el repo de la app: `docs/GOOGLE_AUTH_SETUP.md`) |
| `GOOGLE_WEB_CLIENT_SECRET` | **Obligatorio** para login Google vía `POST /auth/google/exchange-code` (p. ej. Expo Go): secreto del cliente Web en Google Cloud. En Render: Environment → añadir variable. No lo pongas en la app Expo. |
| `GOOGLE_PLACES_API_KEY` | Proxy de fotos `/green-zones/hermosillo/place-photo*` |
| `GEOAPIFY_API_KEY` | Opcional: enriquecimiento de zonas tras Overpass |
| `FOURSQUARE_API_KEY` | Opcional: idem |
| `PUBLIC_API_URL` | URLs en correos (verificación, etc.) |

## Rutas HTTP actuales

Base: `http://localhost:3000` (o tu URL de producción).

### Raíz y estáticos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | `public/index.html` |
| `GET` | `/health` | `{ "status": "ok" }` |
| `GET` | `/privacy` | Página de privacidad |
| `GET` | `/terms` | Términos |

### Autenticación — `/auth`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/register` | Registro |
| `POST` | `/auth/login` | Login |
| `GET` | `/auth/verify-email` | Verificación de correo (query según implementación) |
| `POST` | `/auth/resend-verification` | Reenvío de verificación |
| `POST` | `/auth/forgot-password` | Solicitar recuperación de contraseña |
| `GET` | `/auth/reset-password` | Formulario web de nueva contraseña por token |
| `POST` | `/auth/reset-password` | Confirmar nueva contraseña con token |
| `POST` | `/auth/google` | Login con Google |
| `POST` | `/auth/google/exchange-code` | Intercambio code+PKCE (Expo Go / flujo web) |

### Dispositivos — `/devices`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/devices` | Lista dispositivos (incluye estado de vínculo y usuario vinculado) |
| `POST` | `/devices` | Alta (`name`, `location`, `latitude`, `longitude`) |
| `GET` | `/devices/:id` | Detalle por id público (`UG...`) o id interno numérico |
| `PATCH` | `/devices/:id` | Actualiza `plant_type` |
| `GET` | `/devices/:id/link-status` | Estado de vínculo (`is_linked`, `linked_zone`, `linked_user_id`, `linked_username`) |
| `POST` | `/devices/:id/link` | Vincula dispositivo a zona/usuario (`zone`, `user_id`, `username`) |
| `POST` | `/devices/:id/unlink` | Desvincula dispositivo (limpia zona/usuario vinculados) |

### Datos de sensor — `/sensor-data`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/sensor-data` | Ingesta: `device_id`, `temperature`, `humidity`, `soil_moisture`, `battery_level` (opcional), `battery_voltage` (opcional) |
| `POST` | `/sensor-data/simulate` | Inserta lectura simulada para pruebas |
| `GET` | `/sensor-data` | Últimas lecturas globales; query `limit` (1–100, default 100) |
| `GET` | `/sensor-data/:device_id` | Hasta 100 lecturas de ese `device_id` |

### Control de riego — `/control-riego`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/control-riego/:idsensor` | Promedio de humedad y recomendación de acción (`encender/apagar/mantener`) |

### Zonas verdes (Hermosillo) — `/green-zones`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/green-zones/hermosillo` | Lista zonas en caché. Query: `refresh=true` fuerza nuevo fetch Overpass (+ externas si hay API keys) |
| `POST` | `/green-zones/hermosillo/intersections` | Zonas que intersectan un polígono. Body: `{ "polygon": [[lng,lat], ...], "refresh": true }` (opcional) |
| `GET` | `/green-zones/hermosillo/place-photo` | Proxy imagen de parque (Google Places) |
| `GET` | `/green-zones/hermosillo/place-photo-count` | Proxy conteo de fotos |

Respuesta de zonas incluye campos como `category_code`, `confidence`, `sources`, `tags: { osm, external }` y `category` (español) según el servicio actual.

### Catálogo de plantas — `/plant-catalog` y `/plants` (listado/detalle)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/plant-catalog` | Lista/búsqueda por `q` |
| `GET` | `/plant-catalog/:name` | Planta por nombre |
| `GET` | `/plants` | Alias de catálogo (lista/búsqueda) |
| `GET` | `/plants/:name` | Alias de catálogo (detalle) |

### IA de plantas — `/plants`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/plants/classify` | Clasificación de imagen (rate limit) |
| `POST` | `/plants/insights` | Notas / insights (Gemini u otro proveedor) |
| `POST` | `/plants/chat` | Chat sobre la planta analizada (solo Gemini; requiere `GEMINI_API_KEY`; rate limit propio) |
| `POST` | `/plants/gemini-test` | Prueba de conexión Gemini (si está configurado) |

### Plantas de usuario — `/user` (requiere autenticación)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/user/plants` | Lista plantas guardadas del usuario |
| `POST` | `/user/plants` | Guardar identificación |
| `DELETE` | `/user/plants/:id` | Eliminar |

### Clima — `/weather`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/weather/temperature` | Temperatura (query según controlador) |
| `POST` | `/weather/temperature/batch` | Lote de puntos para temperatura |

### Contrato OpenAPI

Si el repositorio incluye `openapi.json`, puede estar desactualizado respecto a las rutas anteriores; la fuente de verdad es `app.js` y los archivos en `routes/`.

## Caché de zonas verdes

- **Memoria + disco**: el servicio guarda resultados en `data/hermosillo-green-zones.json` y en memoria con TTL.
- **Forzar datos nuevos**: `GET /green-zones/hermosillo?refresh=true` o `POST` intersections con `"refresh": true`.
- **Solo borrar archivo en disco** (p. ej. antes de reiniciar): `npm run invalidate-green-zones-cache`. Con el API en ejecución, para refrescar al momento usa `refresh=true` en la petición.

## Despliegue (Render u otro PaaS)

1. Variables de entorno en el panel (no subir `.env` al repositorio).
2. `npm start` como comando de arranque.
3. `DATABASE_URL` apuntando a Postgres gestionado.
4. Disco persistente opcional si guardas SQLite o archivos en `data/` (en Render suele montarse un volumen).

## Documentación histórica

Secciones antiguas sobre Netlify, `/devices/register` o `/sensor-history` pueden no coincidir con el código actual; usar la tabla de rutas de este README.
