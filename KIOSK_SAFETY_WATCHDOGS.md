# Kiosk Safety Watchdogs

This project includes a few conservative recovery mechanisms for long museum/kiosk sessions.

## Route Reloads

The main game route `/` no longer uses periodic idle reloads by default:

- `SETTINGS.installation.watchdog.gameIdleReloadMs` is `0` (disabled)
- the museum already reboots daily at 09:00
- idle reload can be re-enabled by setting a positive value if needed

When enabled, the idle reload watchdog:

- only reloads when gameplay is in the `idle` flow state
- does not reload during active play, game-over travel, or initials entry

The `/scoreboard` route has a scheduled maintenance reload:

- after `SETTINGS.installation.watchdog.scoreboardReloadMs`
- default: `4 hours`
- the reload becomes pending after the interval
- it only actually reloads once the scoreboard receives an `idle_started` event
- this avoids blanking/reloading the scoreboard during an active game session

Both routes also reload after WebGL context loss:

- controlled by `SETTINGS.installation.watchdog.webglContextLostReloadMs`
- default: `1500ms`

## Scoreboard Connection Recovery

The scoreboard WebSocket already reconnects automatically. In addition, `/scoreboard` reloads if the WebSocket stays disconnected/erroring for:

- `SETTINGS.installation.watchdog.scoreboardStaleReloadMs`
- default: `10 minutes`

This is meant as a deeper recovery step if reconnects do not restore the connection.

## External Camera Input Watchdog

When `SETTINGS.cursor.inputSource` is `"external"`, the game listens to cursor frames from the RTSP/camera app.

The external frame watchdog:

- only runs in external cursor mode
- reconnects the cursor WebSocket if it is open but no `cursor_frame` arrives for `SETTINGS.cursor.external.frameWatchdog.staleFrameMs`
- default: `3 seconds`
- rate-limits reconnects with `reconnectCooldownMs`
- default: `5 seconds`
- reloads the game page only if input stays stale and the game is idle
- default idle reload threshold: `30 seconds`

In `"mouse"` mode, the external cursor bridge does not connect, and this watchdog does not run.

## Ctrl+X Kiosk Stop

The kiosk stop shortcut is handled in the browser:

- `Ctrl+X`
- fallback: `Ctrl+Alt+Shift+Q`
- fallback: `Ctrl+Alt+Shift+Esc`

The shortcut posts to:

```text
POST /__dev/installation/stop
```

That endpoint stops the process groups tracked by the installation launcher, closing the game browser, scoreboard browser, game server, highscore server, and RTSP app.

Important: because the installation now runs via `vite preview` instead of `vite dev`, the stop endpoint must be registered for preview as well as dev. That is handled by `vite-plugin-installation-stop.js`.

## Deployment Notes

The desktop launcher runs the production-style built app through `npm run start:installation`.

Use `Uppdatera + Starta IKEA Game` when you want a fresh update and rebuild. It runs:

```bash
./update-all.sh
./start-game.sh
```

`update-all.sh` runs `npm run build`, so the kiosk starts from the latest built `dist/` output.
