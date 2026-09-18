# CONTEXT.md

## Glossary

### Auth strategies (YouTube Music)

- **Cookie auth**: Copiar cookies de sesión del navegador (`SAPISID`, etc.) y pasarlas a `Innertube.create({ cookie })`. Simple pero las cookies expiran sin refresco automático.
- **OAuth2 auth**: Flujo "device code" de Google. Provee `access_token` + `refresh_token`. `youtubei.js` refresca el `access_token` automáticamente. Requiere setup inicial en Google Cloud Console.
- **Anonymous mode**: `Innertube.create()` sin credenciales. Permite búsquedas básicas pero no creación de playlists ni operaciones que requieren cuenta.

### Infrastructure

- **Render free tier**: Plataforma de hosting. Los dynos duermen tras 15 min de inactividad. El filesystem persiste entre sleeps pero se resetea en deploys.
- **Telegram notifier**: Repo externo (`maycomayco/telegram-notifier`) que dispara este endpoint semanalmente vía GitHub Actions.

## Decisions

Ver `docs/adr/`.

- [ADR-0001](docs/adr/0001-oauth-token-persistence.md): Tokens OAuth2 se persisten en archivo JSON en disco, no en env vars.
