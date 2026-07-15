# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Drizzl is an ad-free weather **PWA** with no build step, no framework, and no dependencies. The entire app is one file — `index.html` (~2,900 lines: inline `<style>`, HTML shell, one inline `<script>`). Supporting files: `sw.js` (service worker), `manifest.json`, self-hosted `fonts/`, and `icons/`. There is no `package.json`, no bundler, and no test suite — edit `index.html`/`sw.js` directly.

## Commands

There is nothing to build, lint, or test. To develop, serve the directory over HTTP (needed for the service worker and `fetch`; `file://` won't work):

```bash
python3 -m http.server 8000
```

**Path caveat:** the app deploys to GitHub Pages under the `/drizzl/` base path (see `manifest.json` `start_url` and the absolute `/drizzl/...` entries in `sw.js`'s `STATIC_ASSETS`). `index.html` itself uses only relative paths, so it renders fine at any URL — but the service worker's precache targets `/drizzl/...` and will only succeed when the app is served under a matching `/drizzl/` path. For faithful offline/SW testing, serve the repo so the app lives at `http://localhost:8000/drizzl/`.

Deploy = publish to GitHub Pages (`powejam.github.io/drizzl/`). No CI/deploy script in the repo.

## Release ritual (do not skip)

Every deploy must bump **three values in sync**, or clients get stale cached assets:
- `APP_VERSION` — `index.html:477`
- `APP_DEPLOY_DATE` — `index.html:478` (shown in the footer; keep it current)
- `CACHE_NAME` (`drizzl-weather-vNN`) — `sw.js:1`

The service worker deletes any cache whose name ≠ `CACHE_NAME` on `activate`, so bumping `CACHE_NAME` is what actually forces the new asset set to be picked up.

## Architecture

**Data flow.** `init` (bottom of `index.html`) resolves the active location → `loadWeather()` → `fetchWeather()` → `render()`. `render()` regenerates all of `#main`'s HTML as a template string; there is no virtual DOM or component model — it's full re-render on each load/refresh.

**External services** (all keyless; CSP at `index.html:7` allows exactly these three hosts):
- Open-Meteo `/v1/forecast` — current + hourly + 10-day daily (`fetchWeather`).
- Open-Meteo geocoding — city search (`searchLocation`).
- OpenStreetMap Nominatim — reverse-geocode the device location (`reverseGeocode`). Adding any new host requires updating the CSP `connect-src` **and** the SW fetch handler.

**Persistence & location resolution.** `state = { favourites, activeLocation, weather }`, persisted to `localStorage` (`drizzl_favs`, `drizzl_active`). On launch: a manually-searched location (`isGeo:false`) is used directly; otherwise the app re-geolocates, falling back to a saved geo location, then to a hardcoded **London** default.

**Timezone handling — the main source of bugs.** Open-Meteo is called with `timezone: auto`, so `hourly.time` / `daily.*` timestamps are **location-local with no TZ marker**. The browser's clock is a different zone. The code repeatedly shifts "now" by `weather.utc_offset_seconds` to line up. Note two *distinct* shift idioms used deliberately (see comments at `index.html:1921` and `index.html:1930`):
- `now + utc_offset_seconds*1000` → for `.toISOString()` string comparison against `hourly.time`.
- `now + utc_offset_seconds*1000 + getTimezoneOffset()*60000` → to make `Date` **getters** (`getHours`, `getDate`) return location-local values, used by `sunTimes()` and local-time display.
Most "wrong hour" / "Now chip" regressions in the git history come from mixing these up. Today's high/low is derived from the hourly array (00:00→24:00), **not** the daily aggregate, which is backward-looking for the current day.

**Service worker caching** (`sw.js`), three strategies:
- Navigations (HTML): network-first with a 2.5s timeout → cache fallback (so deploys land on next refresh even on slow networks).
- API hosts (open-meteo, nominatim): network-first → cache fallback (offline support).
- Static assets: cache-first.

**Self-contained astronomy.** Sun and moon math is computed client-side with no library: `sunTimes`, `moonPhase`, `moonAltitude`, `getMoonTimes`, plus SVG renderers `renderDaylightArc` / `renderMoonArc` / `renderMoonDisc` (dawn/noon/dusk markers, current-position dot).

**Avatar system.** ~103 animal/mythic avatars in `AVATARS` (`index.html:549`). `pickAvatar()` runs each entry's `fits(c)` scorer over the current conditions (time-of-day bucket, weather category, season, temp, wind) and picks a weighted winner, seeded via `avatarSeed()` so it's stable within a session. Comments reference an external `drizzl-avatar-lab.html` design lab that is **not** in this repo.

**Weather codes.** The `WMO` table (`index.html:507`) maps codes → `[description, dayIcon, altIcon, nightIcon]`. `adjustCode()` downgrades a precip code to "overcast" when probability of precipitation is 0.

**Atmosphere.** `updateAtmosphere()` sets `#atmosphere`'s gradient and toggles `.atmos-*` body classes by weather + day/night + temperature; those classes also re-tune card/text contrast (e.g. dark text on the snow theme).

## Conventions

- `SCRATCH/` is gitignored — used for local screenshots / scratch files; don't commit it.
- Keep everything inline and dependency-free; no external CDNs (CSP forbids them anyway).
