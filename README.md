# SIGNAL

A community-facing, unofficial internet-radio-style web toy: a terminal/CRT
tuning-dial receiver with 9 curated stations, real songs, station idents,
scanning, presets, and a power switch.

Built on top of [`cyberspace-crt`](https://github.com/unremarkablegarden/cyberspace-crt),
the WebGL2 CRT text-grid engine open-sourced from [cyberspace.online](https://cyberspace.online).
**SIGNAL is a standalone project — it is not affiliated with, endorsed by, or
hosted by Cyberspace.** It just uses their engine (MIT licensed) to render a
different program on top of it.

## Try it

**https://hyphen8d.github.io/signal/**

## Run it locally

No build step. Clone the repo and serve the directory over HTTP (it won't
work opened directly as a `file://` URL — the font fetch needs a real
origin):

```
python3 tools/dev-server.py 8000
```

Then open `http://localhost:8000`. That server sends `Cache-Control:
no-store` on every response, which matters if you're actively editing —
plain `python3 -m http.server` can serve you a stale cached copy of
`program.js` mid-edit.

## Controls

| Key | Action |
|---|---|
| `<-` / `->` | Seek |
| `Enter` | Lock onto the nearest station |
| `S` | Scan (auto-sweep, locks when it finds a station) |
| `1`–`9` | Jump straight to a preset station |
| `Space` | Play / pause |
| `N` | Skip to another track on the current station |
| `Up` / `Down` | Volume |
| `M` | Mute |
| `P` | Power off / on |
| drag the dial | Seek with the mouse |

## Stations

9 stations, 10 tracks each. Full roster with taglines and track lists:
[`channels.md`](./channels.md) — generated straight from the live
`CHANNELS` array in `program.js` (`tools/channels-to-md.js`), so it can't
drift from the actual source of truth. Re-run it after editing the station
list:

```
node tools/channels-to-md.js
```

## How it's built

- `program.js` — the whole app: tuning, stations, playback, sound effects,
  power sequence, all the CRT-panel drawing. Implements the engine's
  `{ init, frame, key, keyUp }` program contract.
- `src/` — the `cyberspace-crt` engine itself (WebGL2 renderer, CRT shader
  passes, the 80x25 text grid, bitmap font parser).
- `index.html` / `main.js` — thin bootstrap that mounts the engine and hands
  it `program.js`.
- `fonts/` — Terminus bitmap font (SIL OFL 1.1, separate from the MIT
  license below — see `LICENSE`).
- `tools/` — dev server and the channel-roster doc generator.

Playback is real YouTube video via the IFrame API, audio-only in practice —
the player is docked off-screen since the terminal is the only visible UI.

## License

MIT — see `LICENSE`. The bitmap fonts in `fonts/` are separately licensed
(SIL Open Font License 1.1); see `fonts/OFL.txt`.
