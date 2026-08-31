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

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { STATIONS } from '../stations.js'
import { buildStationsMd } from './lib/roster.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.join(here, '..', 'stations.md')
writeFileSync(outPath, buildStationsMd(STATIONS))
console.log(`Wrote ${outPath}`)
