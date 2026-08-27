// Offline roster rules -- the content-ops constraints README documents,
// checked mechanically (2026-08-25 audit). No network; runs in well under a
// second. Used three ways:
//
//   node tools/lint-roster.js          # standalone, nonzero exit on any problem
//   node tools/verify-roster.js        # runs this first, then the oEmbed check
//   node --test tests/                 # tests/roster.test.mjs asserts it passes
//
// Rules (each cites where it comes from):
//   - exactly 9 public stations (README "Station count": the 1-9 preset keys)
//   - tagline fits the guide index's LANE column (README "Taglines").
//     History: a flat 35 (safe for the longest callsign), then 2026-08-25's
//     `52 - callsign.length`, which was right while the index drew one joined
//     line -- a long callsign ate the tagline's budget because they shared a
//     row. 2026-08-27 the index moved to fixed column stops, so they no
//     longer share anything: the LANE column starts at x=37 on the 80-col
//     grid and runs to the edge, giving every station the same flat 43
//     regardless of callsign. Short-callsign stations lose a little headroom
//     (CIPHER could have had 46), long-callsign ones gain a lot
//     (DISTORTION FIELD had 36). See GUIDE_INDEX_COLS in ui/guide.js.
//   - at least 10 tracks per station (README "Adding tracks")
//   - 4 ident tones per station (10th pass: "station IDs set to 4 tones long")
//   - every dial glyph actually exists in fonts/ter-u16n.bdf (an unmapped
//     codepoint renders blank and silently deletes the station from the dial
//     -- drawDial's own note)
//   - every station.visual names a built effect (visuals/index.js), else it
//     silently falls back to DRIFT
//   - frequencies inside the band, unique, and at least LOCK_THRESHOLD*2
//     apart so two carriers can never both be inside lock range at once
//   - no YouTube ID appears twice across the whole roster (secret included)
//   - every track has a title and artist

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
globalThis.SIGNAL_BUILD ??= 'lint'
globalThis.matchMedia ??= () => ({ matches: false })

// The guide index's LANE column: 80 - GUIDE_INDEX_COLS.tagline (37). Kept as
// a literal rather than imported from ui/guide.js on purpose -- that module
// pulls in the WebAudio sfx chain at load, which Node has no business
// touching for a roster lint. tests/program.test.mjs asserts the two agree,
// so the duplication cannot drift silently.
export const TAGLINE_MAX = 43

export async function lintRoster() {
  const { STATIONS, SECRET_STATIONS } = await import('../stations.js?v=lint')
  const { FREQ_MIN, FREQ_MAX, LOCK_THRESHOLD } = await import('../tuning.js?v=lint')
  const { VISUALS } = await import('../visuals/index.js?v=lint')
  const { parseBDF } = await import('../src/bdf.js')
  const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))

  const problems = []
  const warnings = []
  const all = [...STATIONS, ...SECRET_STATIONS]
  if (STATIONS.length !== 9) problems.push(`expected exactly 9 public stations, found ${STATIONS.length}`)

  const seenIds = new Map()
  for (const st of all) {
    const who = `${st.callsign} (${st.id})`
    if (!st.tagline) problems.push(`${who}: no tagline`)
    else if (!st.secret && st.tagline.length > TAGLINE_MAX) {
      problems.push(`${who}: tagline is ${st.tagline.length} chars; the guide index's LANE column fits ${TAGLINE_MAX}`)
    }
    if (!st.tracks || st.tracks.length < 10) problems.push(`${who}: only ${st.tracks?.length ?? 0} tracks (min 10)`)
    if (!Array.isArray(st.ident) || st.ident.length !== 4) problems.push(`${who}: ident has ${st.ident?.length ?? 0} tones (want 4)`)
    if (!(st.freq >= FREQ_MIN && st.freq <= FREQ_MAX)) problems.push(`${who}: freq ${st.freq} outside ${FREQ_MIN}-${FREQ_MAX}`)
    if (st.visual && !VISUALS[st.visual]) problems.push(`${who}: visual '${st.visual}' is not a built effect`)
    if (!st.secret) {
      if (!st.glyph) problems.push(`${who}: no dial glyph`)
      else if (!font.glyphs.has(st.glyph.codePointAt(0))) problems.push(`${who}: glyph '${st.glyph}' (U+${st.glyph.codePointAt(0).toString(16)}) is not in ter-u16n.bdf`)
    }
    for (const t of st.tracks || []) {
      if (!t.youtubeId || !t.title || !t.artist) problems.push(`${who}: malformed track ${JSON.stringify(t)}`)
      if (seenIds.has(t.youtubeId)) problems.push(`${who}: ${t.youtubeId} (${t.title}) already used by ${seenIds.get(t.youtubeId)}`)
      else seenIds.set(t.youtubeId, who)
    }
  }
  const sorted = [...all].sort((a, b) => a.freq - b.freq)
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].freq - sorted[i - 1].freq
    if (gap < LOCK_THRESHOLD * 2) problems.push(`${sorted[i - 1].callsign} and ${sorted[i].callsign} are only ${gap.toFixed(1)} apart (min ${LOCK_THRESHOLD * 2})`)
  }
  return { problems, warnings, stations: all.length, tracks: all.reduce((n, s) => n + s.tracks.length, 0) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problems, warnings, stations, tracks } = await lintRoster()
  console.log(`Roster rules: ${stations} station(s), ${tracks} track(s), ${problems.length} problem(s), ${warnings.length} warning(s).`)
  for (const p of problems) console.log(`  - ${p}`)
  for (const w of warnings) console.log(`  ! ${w}`)
  process.exit(problems.length ? 1 : 0)
}
