// Generates a human-readable Markdown snapshot of CHANNELS straight from
// program.js -- not a hand-maintained duplicate, so it can never drift from
// the actual source of truth. Run with: node tools/channels-to-md.js
//
// Extracts the CHANNELS array literal by brace-matching (program.js is a
// browser ES module -- './src/term.js' touches window/DOM, so it can't be
// require()'d directly in Node) and evals it with a local stub for
// realTrack(), then formats it as Markdown.

const fs = require('fs')
const path = require('path')

const programPath = path.join(__dirname, '..', 'program.js')
const src = fs.readFileSync(programPath, 'utf8')

const constStart = src.indexOf('const CHANNELS = [')
if (constStart === -1) throw new Error('CHANNELS array not found in program.js')
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
const CHANNELS = eval(arrText)

const lines = []
lines.push('# SIGNAL -- channel roster')
lines.push('')
lines.push(`Generated from program.js. ${CHANNELS.length} stations, ${CHANNELS.reduce((n, c) => n + c.tracks.length, 0)} tracks total.`)
lines.push('')

for (const ch of CHANNELS) {
  lines.push(`## ${ch.callsign} -- ${ch.freq.toFixed(1)}`)
  lines.push('')
  lines.push(`*${ch.tagline}*`)
  lines.push('')
  lines.push(`Ident tones (Hz): ${ch.ident.join(', ')}`)
  lines.push('')
  lines.push(`Tracks (${ch.tracks.length}):`)
  lines.push('')
  ch.tracks.forEach((t, i) => {
    lines.push(`${i + 1}. **${t.title}** -- ${t.artist}  ([youtu.be/${t.youtubeId}](https://youtu.be/${t.youtubeId}))`)
  })
  lines.push('')
}

const outPath = path.join(__dirname, '..', 'channels.md')
fs.writeFileSync(outPath, lines.join('\n'))
console.log(`Wrote ${outPath}`)
