// Generates a human-readable Markdown snapshot of STATIONS straight from
// program.js -- not a hand-maintained duplicate, so it can never drift from
// the actual source of truth. Run with: node tools/stations-to-md.js
//
// Extracts the STATIONS array literal by brace-matching (program.js is a
// browser ES module -- './src/term.js' touches window/DOM, so it can't be
// require()'d directly in Node) and evals it with a local stub for
// realTrack(), then formats it as Markdown.
//
// 36th pass: renamed from channels-to-md.js/channels.md -- Matthew: "these
// are STATIONS, that's what they're called" -- program.js's CHANNELS array
// and channel-prefixed identifiers were renamed to STATIONS/station-prefixed
// at the same time, so this generator and its output file follow suit.

const fs = require('fs')
const path = require('path')

const programPath = path.join(__dirname, '..', 'program.js')
const src = fs.readFileSync(programPath, 'utf8')

const constStart = src.indexOf('const STATIONS = [')
if (constStart === -1) throw new Error('STATIONS array not found in program.js')
const braceStart = src.indexOf('[', constStart)
let depth = 0, braceEnd = -1
for (let i = braceStart; i < src.length; i++) {
  if (src[i] === '[') depth++
  else if (src[i] === ']') { depth--; if (depth === 0) { braceEnd = i; break } }
}
const arrText = src.slice(braceStart, braceEnd + 1)

function realTrack(youtubeId, title, artist) {
  return { id: `yt:${youtubeId}:real`, youtubeId, title, artist }
}
const STATIONS = eval(arrText)

const lines = []
lines.push('# SIGNAL -- station roster')
lines.push('')
lines.push(`Generated from program.js. ${STATIONS.length} stations, ${STATIONS.reduce((n, c) => n + c.tracks.length, 0)} tracks total.`)
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

const outPath = path.join(__dirname, '..', 'stations.md')
fs.writeFileSync(outPath, lines.join('\n'))
console.log(`Wrote ${outPath}`)
