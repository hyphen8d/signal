// Generates a human-readable Markdown snapshot of STATIONS straight from
// stations.js -- not a hand-maintained duplicate, so it can never drift from
// the actual source of truth. Run with: node tools/stations-to-md.js
//
// 2026-08-25 audit: the roster now lives in stations.js, a pure-data ES
// module with no DOM imports, so this just imports it. Before that it had
// to brace-match the `const STATIONS = [` literal out of program.js's source
// text and eval() it with a realTrack() stub, because program.js imports
// ./src/term.js (which touches window) and couldn't be loaded in Node.
//
// 36th pass: renamed from channels-to-md.js/channels.md to match the
// STATIONS naming -- program.js's CHANNELS array
// and channel-prefixed identifiers were renamed to STATIONS/station-prefixed
// at the same time, so this generator and its output file follow suit.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { STATIONS } from '../stations.js'

const here = path.dirname(fileURLToPath(import.meta.url))

const lines = []
lines.push('# SIGNAL -- station roster')
lines.push('')
lines.push(`Generated from stations.js. ${STATIONS.length} stations, ${STATIONS.reduce((n, c) => n + c.tracks.length, 0)} tracks total.`)
lines.push('')

for (const st of STATIONS) {
  lines.push(`## ${st.callsign} -- ${st.freq.toFixed(1)}`)
  lines.push('')
  lines.push(`*${st.tagline}*`)
  lines.push('')
  lines.push(`Ident tones (Hz): ${st.ident.join(', ')}`)
  lines.push('')
  lines.push(`Tracks (${st.tracks.length}):`)
  lines.push('')
  st.tracks.forEach((t, i) => {
    lines.push(`${i + 1}. **${t.title}** -- ${t.artist}  ([youtu.be/${t.youtubeId}](https://youtu.be/${t.youtubeId}))`)
  })
  lines.push('')
}

const outPath = path.join(here, '..', 'stations.md')
writeFileSync(outPath, lines.join('\n'))
console.log(`Wrote ${outPath}`)
