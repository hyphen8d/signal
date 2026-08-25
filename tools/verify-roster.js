// Spot-checks every track ID in program.js against YouTube's oEmbed
// endpoint and reports any that are now dead, private, or region/embed
// restricted. Run with:
//
//   node tools/verify-roster.js                    # whole roster
//   node tools/verify-roster.js --station=atomic    # one station only
//
// oEmbed 200 confirms a video is real and embeddable at check time -- it is
// NOT a guarantee the IFrame player will actually reach a PLAYING state in
// every browser/session/region (see program.js's dead-video/stall-recovery
// handling for that side of it). This is a periodic spot-check against
// rot, not a substitute for the app's own runtime safety net.
//
// Extracts STATIONS the same way tools/stations-to-md.js does: brace-match
// the array literal out of program.js (a browser ES module that touches
// window/DOM and can't be require()'d directly) and eval it with a local
// realTrack() stub.
//
// 36th pass: renamed --channel= to --station= (and STATIONS/station
// throughout) to match the STATIONS naming.

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const stationArg = args.find(a => a.startsWith('--station='))
const onlyStation = stationArg ? stationArg.split('=')[1] : null

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

const stations = onlyStation
  ? STATIONS.filter(c => c.id === onlyStation)
  : STATIONS

if (onlyStation && stations.length === 0) {
  console.error(`No station with id "${onlyStation}". Known ids: ${STATIONS.map(c => c.id).join(', ')}`)
  process.exit(2)
}

async function checkTrack(youtubeId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`
  try {
    const res = await fetch(url)
    return { ok: res.status === 200, status: res.status }
  } catch (err) {
    return { ok: false, status: 'ERR', error: String(err?.message ?? err) }
  }
}

// Small concurrency cap so this doesn't hammer the endpoint or trip a rate limit.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function main() {
  const total = stations.reduce((n, c) => n + c.tracks.length, 0)
  console.log(`Checking ${total} track(s) across ${stations.length} station(s) against oEmbed...\n`)

  const failures = []
  let checked = 0

  for (const st of stations) {
    const results = await mapLimit(st.tracks, 6, async (t) => {
      const r = await checkTrack(t.youtubeId)
      checked++
      return { track: t, ...r }
    })

    const bad = results.filter(r => !r.ok)
    if (bad.length) {
      console.log(`${st.callsign} (${st.id}) -- ${bad.length} problem(s):`)
      for (const b of bad) {
        console.log(`  [${b.status}] ${b.track.title} -- ${b.track.artist} (youtu.be/${b.track.youtubeId})`)
        failures.push({ station: st.id, ...b })
      }
      console.log('')
    }
  }

  console.log(`Checked ${checked} track(s). ${failures.length} problem(s) found.`)
  if (failures.length) {
    console.log('\nFailing IDs, for quick copy/paste:')
    failures.forEach(f => console.log(`  ${f.station}: ${f.track.youtubeId} -- ${f.track.title}`))
    process.exit(1)
  }
}

main().catch(err => {
  console.error('verify-roster failed:', err)
  process.exit(2)
})
