// How well does the lyrics lookup actually do? Measured against the live
// LRCLIB API, on the real roster.
//
//   node tools/lyrics-audit.mjs                  # ~8 tracks per station
//   node tools/lyrics-audit.mjs --per=20         # a deeper sample
//   node tools/lyrics-audit.mjs --station=nin    # one station only
//
// Written 2026-08-30, when [L] was reaching for lyrics with a single
// /api/get on the raw title and nothing else. The honest question -- "how
// often does that work?" -- had never been asked, and the answer was 59%
// of a 101-track sample. Adding the /api/search fallback took it to 76%.
// Those two numbers are why audio/voice.js looks the way it does, and this
// file exists so the next person can re-measure instead of trusting them.
//
// Three things it is deliberately built to tell you apart:
//
//   - A MATCH is not a good match. Searching a track whose live cut is
//     popular returns the live cut first, and its timings fit nothing. The
//     duration column is what catches that, and it is why voice.js ranks
//     search results by closeness to the recording actually playing rather
//     than taking row zero.
//   - A track with no lyrics is not a FAILURE. A good part of the roster is
//     instrumental -- CIPHER and SYNAPSE especially -- so the ceiling here
//     is well under 100% and a run that reported 100% would mean the
//     matcher had started accepting anything.
//   - Title normalisation was tried here and REJECTED on the evidence. The
//     roster's decorations ("Piggy (VEVO Presents)") really do 404 on
//     /api/get, so stripping them looks obviously right; measured, it
//     recovered nothing the search fallback did not already catch. The
//     strategy is still implemented below so the claim stays checkable.
//
// Prints COUNTS AND DURATIONS ONLY, never lyric text: this is a coverage
// report, not a lyrics dump, and there is no reason for the words to be in
// it. Durations come from tools/roster-health.json, which check-roster.mjs
// already keeps for every track.
//
// Be polite -- it is a free, keyless, community-run service. The sampling
// and the sleeps below are deliberate; do not turn this into a full-roster
// hammer without a good reason.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const args = process.argv.slice(2)
const flag = (n, d) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const PER = Math.max(1, Number(flag('per', 8)))
const ONLY = flag('station', null)

const UA = { 'user-agent': 'signal-lyrics-audit/1.0 (+https://github.com/hyphen8d/signal)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

globalThis.SIGNAL_BUILD = 'audit'
globalThis.matchMedia = () => ({ matches: false })
const s = await import(path.join(root, 'stations.js') + '?v=audit')
const voice = await import(path.join(root, 'audio/voice.js') + '?v=audit')
const { pickLyricMatch, lyricDurationOk, LYRIC_DURATION_TOLERANCE } = voice

let health = {}
try { health = JSON.parse(readFileSync(path.join(root, 'tools/roster-health.json'), 'utf8')).records || {} } catch (e) {}

// The rejected strategy, kept so the rejection stays testable. See header.
const DECOR = /\s*[([](?:[^)\]]*\b(?:vevo|presents|live|official|video|audio|remaster(?:ed)?|remix|version|edit|mono|stereo|lyric[s]?|session[s]?|acoustic|demo|single|album|extended|\d{2,4})\b[^)\]]*)[)\]]\s*/gi
const norm = (t) => t.replace(DECOR, ' ').replace(/\s*-\s*(?:live|remaster(?:ed)?).*$/i, '').replace(/\s+/g, ' ').trim()

const synced = (d) => !!(d && typeof d.syncedLyrics === 'string' && d.syncedLyrics.includes('['))
const q = (title, artist) => new URLSearchParams({ track_name: title, artist_name: artist })

async function apiGet(title, artist) {
  try {
    const r = await fetch(`https://lrclib.net/api/get?${q(title, artist)}`, { headers: UA })
    return r.ok ? await r.json() : null
  } catch { return null }
}
async function apiSearch(title, artist, want) {
  try {
    const r = await fetch(`https://lrclib.net/api/search?${q(title, artist)}`, { headers: UA })
    if (!r.ok) return null
    return pickLyricMatch(await r.json(), want)
  } catch { return null }
}

const stations = [...(s.STATIONS || []), ...(s.SECRET_STATIONS || [])]
  .filter((st) => !ONLY || st.id === ONLY)
if (!stations.length) { console.error(`No station matched --station=${ONLY}`); process.exit(1) }

const sample = []
for (const st of stations) {
  const tr = st.tracks || []
  const step = Math.max(1, Math.floor(tr.length / PER))
  for (let i = 0; i < tr.length && sample.filter((x) => x.st === st.callsign).length < PER; i += step) {
    sample.push({ st: st.callsign, ...tr[i] })
  }
}
console.log(`Sampling ${sample.length} track(s) across ${stations.length} station(s). Durations from roster-health.json.\n`)

const tally = { exact: 0, search: 0, none: 0 }
const recovered = [], suspect = [], ungated = []
for (const t of sample) {
  const want = health[t.youtubeId]?.seconds || 0
  const hit = await apiGet(t.title, t.artist)
  await sleep(120)
  let via = null, match = null
  if (synced(hit) && lyricDurationOk(hit.duration, want)) { via = 'exact'; match = hit }
  else {
    const alt = await apiSearch(t.title, t.artist, want)
    await sleep(150)
    if (synced(alt) && lyricDurationOk(alt.duration, want)) { via = 'search'; match = alt }
    // Matched something real, but for a recording of the wrong length --
    // the case the gate refuses. Worth seeing: it is a track that WOULD
    // have shown drifting lyrics before 2026-08-30.
    else if (synced(hit) || synced(alt)) {
      const m = synced(alt) ? alt : hit
      suspect.push(`${t.st.padEnd(17)} ${String(t.title).slice(0, 32).padEnd(32)} playing ${want}s vs lyric ${Math.round(m.duration || 0)}s`)
    }
  }
  if (via === 'exact') tally.exact++
  else if (via === 'search') { tally.search++; recovered.push(`${t.st.padEnd(17)} ${t.artist} - ${t.title}`) }
  else tally.none++
  if (match && !want) ungated.push(t.youtubeId)
}

const n = sample.length
const ok = tally.exact + tally.search
const pct = (v) => `${((v / n) * 100).toFixed(0)}%`
console.log(`  /api/get   (exact title+artist) : ${String(tally.exact).padStart(3)}/${n}  ${pct(tally.exact)}`)
console.log(`  /api/search fallback            : ${String(tally.search).padStart(3)}     +${pct(tally.search)}`)
console.log(`  no synced lyrics found          : ${String(tally.none).padStart(3)}`)
console.log(`  ----------------------------------------------`)
console.log(`  RESOLVED                        : ${String(ok).padStart(3)}/${n}  ${pct(ok)}`)
if (recovered.length) {
  console.log(`\nRecovered by the search fallback (${recovered.length}):`)
  for (const r of recovered) console.log('  ' + r)
}
if (suspect.length) {
  console.log(`\nRefused by the duration gate -- >${LYRIC_DURATION_TOLERANCE}s apart, so the timings would drift (${suspect.length}):`)
  for (const r of suspect) console.log('  ' + r)
  console.log('  A different recording is unfixable; an upload with lead-in padding')
  console.log('  would need a per-track offset, which is not built.')
}
if (ungated.length) {
  console.log(`\n${ungated.length} track(s) had no known duration, so nothing could be gated against.`)
  console.log('Run `npm run health` to fill tools/roster-health.json first.')
}
