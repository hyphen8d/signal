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

// 2026-08-31: this file used to carry a byte-identical COPY of the generator
// that also lives in tools/lib/roster.mjs as buildStationsMd(), which the
// admin dashboard calls. Two copies, and this was the one people actually
// ran -- so band grouping added to the library reached the dashboard and left
// `npm run stations` producing the old shape. It imports the library now, and
// the duplicate is gone rather than kept in step by hand.

// 2026-11-01: it also rewrites README's derived counts -- the roster
// sentence and the stations/tracks badges -- with rewriteReadmeCounts(),
// the same function the admin server's saves call. README is computed
// FIRST and both files are written only once both exist, so a README whose
// sentence was reworded (the rewriter throws, naming the pattern) fails
// this command with nothing written, rather than half of it. README is
// written only when its numbers actually changed, so a no-op run leaves its
// mtime alone; tools/ship.mjs reads `git status` on both files after this.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { STATIONS, SECRET_STATIONS } from '../stations.js'
import { buildStationsMd, rewriteReadmeCounts } from './lib/roster.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.join(here, '..', 'stations.md')
const readmePath = path.join(here, '..', 'README.md')
const readme = readFileSync(readmePath, 'utf8')
let nextReadme
try {
  nextReadme = rewriteReadmeCounts(readme, STATIONS, SECRET_STATIONS)
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
writeFileSync(outPath, buildStationsMd(STATIONS))
console.log(`Wrote ${outPath}`)
if (nextReadme !== readme) {
  writeFileSync(readmePath, nextReadme)
  console.log(`Updated the roster counts in ${readmePath}`)
}
