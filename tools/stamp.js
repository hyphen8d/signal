// Bumps build.json -- the cache-busting stamp main.js reads on every page
// load (2026-08-25 audit). Run before pushing a deploy:
//
//   node tools/stamp.js
//
// Why a stamp instead of the old `?t=${Date.now()}`: GitHub Pages serves
// every file with `Cache-Control: max-age=600`, and a per-load timestamp was
// the 28th pass's answer to a returning visitor running a 10-minute-stale
// program.js. It worked, but it also meant program.js (512KB, 176KB gzip)
// could NEVER be cached -- every visit, every reload, re-downloaded the whole
// thing. main.js now fetches this tiny file with a per-load `?t=` (so the
// stamp itself is always fresh, straight from origin) and imports
// program.js/config.js/stations.js as `?v=<stamp>` -- a URL that's cacheable
// by the browser and the CDN alike, and that changes exactly when a deploy
// does. Same "no stale-script window" guarantee, one ~30-byte request
// instead of a 176KB one.
//
// Format: YYYY-MM-DD.N, N counting up within a day. Purely a unique string;
// nothing parses it.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { nextStamp } from './lib/stamp.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(here, '..', 'build.json')

let prev = ''
try { prev = JSON.parse(readFileSync(file, 'utf8')).build || '' } catch (e) {}

// The arithmetic lives in tools/lib/stamp.mjs (2026-10-20), shared with
// tools/ship.mjs, which also has to beat origin/main's stamp, not only this
// checkout's.
const build = nextStamp(prev)

writeFileSync(file, JSON.stringify({ build }) + '\n')
console.log(`build.json: ${prev || '(none)'} -> ${build}`)
