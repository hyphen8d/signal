// Spot-checks every track ID in stations.js against YouTube's oEmbed
// endpoint and reports any that are now dead, private, or region/embed
// restricted. Run with:
//
//   node tools/verify-roster.js                    # whole roster, secret stations included
//   node tools/verify-roster.js --station=atomic    # one station only (secret ids work too)
//
// oEmbed 200 confirms a video is real and embeddable at check time -- it is
// NOT a guarantee the IFrame player will actually reach a PLAYING state in
// every browser/session/region (see program.js's dead-video/stall-recovery
// handling for that side of it). This is a periodic spot-check against
// rot, not a substitute for the app's own runtime safety net.
//
// 2026-08-25 audit: imports the roster from stations.js (a pure-data ES
// module) instead of brace-matching `const STATIONS = [` out of program.js
// and eval'ing it. That older extraction only ever saw STATIONS, so the
// secret stations' tracks had never been through this check at all --
// SECRET_STATIONS is walked here now, same as the public roster.
//
// 36th pass: renamed --channel= to --station= (and STATIONS/station
// throughout) to match the STATIONS naming.

import { STATIONS, SECRET_STATIONS } from '../stations.js'
import { lintRoster } from './lint-roster.js'

const args = process.argv.slice(2)
const stationArg = args.find(a => a.startsWith('--station='))
const onlyStation = stationArg ? stationArg.split('=')[1] : null

const ALL = [...STATIONS, ...SECRET_STATIONS]
const stations = onlyStation ? ALL.filter(c => c.id === onlyStation) : ALL

if (onlyStation && stations.length === 0) {
  console.error(`No station with id "${onlyStation}". Known ids: ${ALL.map(c => c.id).join(', ')}`)
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
  // Offline rules first (tools/lint-roster.js) -- cheap, and a broken roster
  // shape isn't worth 286 network requests to discover.
  const lint = await lintRoster()
  for (const w of lint.warnings) console.log(`  ! ${w}`)
  if (lint.problems.length) {
    console.log(`Roster rules: ${lint.problems.length} problem(s):`)
    for (const p of lint.problems) console.log(`  - ${p}`)
    process.exitCode = 1
  }
  if (lint.warnings.length || lint.problems.length) console.log('')
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
      console.log(`${st.callsign} (${st.id}${st.secret ? ', secret' : ''}) -- ${bad.length} problem(s):`)
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
