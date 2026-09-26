# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Drizzl is an ad-free weather **PWA** with no build step, no framework, and no dependencies. The entire app is one file — `index.html` (~2,100 lines: inline `<style>`, HTML shell, one inline `<script>`). Supporting files: `sw.js` (service worker), `manifest.json`, self-hosted `fonts/`, and `icons/`. There is no `package.json`, no bundler, and no test suite — edit `index.html`/`sw.js` directly.

## Commands

There is nothing to build, lint, or test. To develop, serve the directory over HTTP (needed for the service worker and `fetch`; `file://` won't work):

```bash
python3 -m http.server 8000
```

**Paths are all relative** (`index.html`, `sw.js` `STATIC_ASSETS`, `manifest.json` `start_url`/`scope`), so the app works both under `powejam.github.io/drizzl/` and at the root of its own origin (the planned Cloudflare Pages `*.pages.dev` address). Keep it that way — no absolute `/drizzl/...` paths. For faithful SW testing, serve the repo root directly or under any subpath.

Deploy = push to `main`; GitHub Pages publishes `powejam.github.io/drizzl/`. A move to Cloudflare Pages (free `*.pages.dev`, separate origin per app) is planned. No CI/deploy script in the repo.

## Release ritual (do not skip)

Every commit that changes shipped files (`index.html`, `sw.js`, `manifest.json`, `icons/`, `fonts/`) must bump **three values in sync** in that same commit — not just at deploy time — or clients get stale cached assets:
- `APP_VERSION` — `index.html:513`
- `APP_DEPLOY_DATE` — `index.html:514` (shown in the footer; keep it current)
- `CACHE_NAME` (`drizzl-weather-vNN`) — `sw.js:1`

The service worker deletes any `drizzl-weather-*` cache whose name ≠ `CACHE_NAME` on `activate` (prefix-scoped because all `powejam.github.io/*` apps share one origin and one Cache Storage), so bumping `CACHE_NAME` is what actually forces the new asset set to be picked up.

## Architecture

**Data flow.** `init` (bottom of `index.html`) resolves the active location → `loadWeather()` → `fetchWeather()` → `render()`. `render()` regenerates all of `#main`'s HTML as a template string; there is no virtual DOM or component model — it's full re-render on each load/refresh.

**External services** (all keyless; CSP at `index.html:7` allows exactly these three hosts):
- Open-Meteo `/v1/forecast` — current + hourly + 10-day daily (`fetchWeather`).
- Open-Meteo geocoding — city search (`searchLocation`).
- OpenStreetMap Nominatim — reverse-geocode the device location (`reverseGeocode`). Adding any new host requires updating the CSP `connect-src` **and** the SW fetch handler.

**Persistence & location resolution.** `state = { favourites, activeLocation, weather }`, persisted to `localStorage` (`drizzl_favs`, `drizzl_active`) and mirrored to IndexedDB (`drizzl` db, `kv` store, key `state`) by `saveState()`. On launch `idbRestoreState()` refills either value only if its localStorage key is absent (so a deliberately emptied list stays empty), then state is written back to both. `navigator.storage.persist()` is requested at startup; the footer shows "storage persistent/best-effort". On launch: a manually-searched location (`isGeo:false`) is used directly; otherwise the app re-geolocates, falling back to a saved geo location, then to a hardcoded **London** default.

**Timezone handling — the main source of bugs.** Open-Meteo is called with `timezone: auto`, so `hourly.time` / `daily.*` timestamps are **location-local with no TZ marker**. The browser's clock is a different zone. The code repeatedly shifts "now" by `weather.utc_offset_seconds` to line up. Note two *distinct* shift idioms used deliberately (see comments at `index.html:1236` and `index.html:1246`):
- `now + utc_offset_seconds*1000` → for `.toISOString()` string comparison against `hourly.time`.
- `now + utc_offset_seconds*1000 + getTimezoneOffset()*60000` → to make `Date` **getters** (`getHours`, `getDate`) return location-local values, used by `sunTimes()` and local-time display.
Most "wrong hour" / "Now chip" regressions in the git history come from mixing these up. Today's high/low is derived from the hourly array (00:00→24:00), **not** the daily aggregate, which is backward-looking for the current day.

**Service worker caching** (`sw.js`), three strategies:
- Navigations (HTML): network-first with a 2.5s timeout → cache fallback (so deploys land on next refresh even on slow networks).
- API hosts (open-meteo, nominatim): network-first → cache fallback (offline support).
- Static assets: cache-first.

**Self-contained astronomy.** Sun and moon math is computed client-side with no library: `sunTimes`, `moonPhase`, `moonAltitude`, `getMoonTimes`, plus SVG renderers `renderDaylightArc` / `renderMoonArc` / `renderMoonDisc` (dawn/noon/dusk markers, current-position dot).

**Astronomical events.** The top-right badge (`renderAstroEvent`) shows the next sky event, and taps open a list of the next 12. `upcomingAstroEvents()` computes equinoxes/solstices (Meeus ch.27), new/full moons (ch.49), solar/lunar eclipses (ch.54, global — lunar ones note whether the Moon is up locally at mid-eclipse), perihelion/aphelion (ch.38, date only) and a fixed table of approximate meteor-shower peaks (`METEOR_SHOWERS`, date only). A major event within `ASTRO_MAJOR_LEAD_DAYS` pre-empts a sooner new/full moon. Times are formatted in the location's IANA zone (`weather.timezone`) so DST is correct for the event's own date.

**Weather codes.** The `WMO` table (`index.html:602`) maps codes → `[description, dayIcon, altIcon, nightIcon]`. `weather_code` (deterministic model) and `precipitation_probability` (ensemble) disagree often, so every icon goes through `rainAwareCode()` with the PoP shown beside it: a wet icon appears iff PoP ≥ `RAIN_ICON_POP` (40). Below it a wet code becomes a dry one from cloud cover (`cloudCode`); at or above it a dry code becomes light showers. The header/atmosphere use the current hour's PoP (`nowCode`); daily rows use `dailyHourIdxs()` so icon and PoP cover the same hours.

**Atmosphere.** `updateAtmosphere()` sets `#atmosphere`'s gradient and toggles `.atmos-*` body classes by weather + day/night + temperature; those classes also re-tune card/text contrast (e.g. dark text on the snow theme).

## Conventions

- `SCRATCH/` is gitignored — used for local screenshots / scratch files; don't commit it.
- Keep everything inline and dependency-free; no external CDNs (CSP forbids them anyway).
- One-person project: commit and push directly to `main`. No feature branches or PRs.
