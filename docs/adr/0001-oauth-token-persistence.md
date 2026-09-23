# ADR-0001: Persistencia de tokens OAuth2 en archivo JSON

## Estado

Superseded (2026-09-22): se eligió descubrimiento anónimo sin creación de
playlists en la issue #29. Ya no se cargan ni persisten tokens OAuth2.
Las búsquedas autenticadas probadas con `youtubei.js` devolvían HTTP 400,
mientras que las anónimas funcionaban. Se conserva este ADR como registro
de la investigación, no como instrucciones de configuración vigentes.

## Contexto

El servicio de YouTube Music (`youtubeMusicService.js`) requiere autenticación. Actualmente usa cookies de sesión copiadas del navegador (`YOUTUBE_MUSIC_COOKIES`), las cuales expiran sin mecanismo de refresco automático, causando fallas cada pocas semanas.

Investigamos migrar a OAuth2 vía `youtubei.js`, que soporta `access_token` + `refresh_token` con refresco automático. La pregunta abierta era **dónde persistir los tokens** en un entorno Render (servidor sin filesystem persistente entre deploys, aunque sí entre sleeps).

## Decisión

Persistir los tokens OAuth2 (`access_token`, `refresh_token`) en un **archivo JSON en disco** (`data/youtube-oauth-tokens.json`), mientras que los datos estáticos (`CLIENT_ID`, `CLIENT_SECRET`) permanecen en variables de entorno de Render.

## Consecuencias

### Positivas

- `youtubei.js` puede escribir automáticamente los tokens actualizados cuando emite el evento `update-credentials`.
- Cero toil manual: no requiere entrar al dashboard de Render cada vez que el token se refresca.
- Simplicidad operativa: un archivo, una dependencia menos (sin base de datos ni cache externo).

### Negativas

- Los tokens se pierden en cada deploy de Render (el filesystem se resetea). Mitigación: si el archivo no existe, el sistema lee los tokens de una variable de entorno de fallback (`YOUTUBE_OAUTH_TOKENS_JSON`) o inicia el flujo de device-code de nuevo.
- Render free tier "duerme" el dyno tras 15 min de inactividad, pero el disco persiste entre despiertes. Esto es aceptable para un servicio que corre una vez por semana.

## Alternativas consideradas

### Opción A: Variables de entorno para TODO (rechazada)

Guardar `access_token` y `refresh_token` en env vars de Render. **Rechazada porque:** Render no permite mutar env vars desde el runtime del proceso. Cada refresh de token requeriría intervención manual en el dashboard, convirtiendo una ventaja de OAuth2 (auto-refresh) en toil recurrente.

### Opción B: Base de datos / Redis (rechazada)

Usar PostgreSQL o Redis para persistir tokens. **Rechazada porque:** Agrega infraestructura y costo para un servicio personal que corre 1 vez por semana. La complejidad no justifica el beneficio sobre un archivo JSON con fallback a env var.

## Notas

- Este ADR fue resultado de una sesión de grilling con el stakeholder (2026-09-18).
- El stakeholder confirmó que el servicio corre en Render free tier, se invoca 1 vez por semana via GitHub Actions → Telegram notifier, y acepta un paso manual de re-autorización si ocurre un deploy que resetea los tokens.
