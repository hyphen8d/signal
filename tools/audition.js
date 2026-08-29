// Candidate-side companion to verify-roster.js. That one checks tracks that
// are already on the roster; this one checks tracks that aren't yet, and
// builds the page you listen to them on.
//
//   node tools/audition.js --station=city-lights --search="Tomoko Aran Midnight Pretenders"
//   node tools/audition.js --station=city-lights WQ-fuYZnVCE E3HBwtJNplQ ...
//   node tools/audition.js --station=cipher --search="..." --search="..." --limit=8
//
// Search mode prints ranked candidates and stops. Audition mode takes the IDs
// you picked and writes tools/audition.html -- open it through the dev server
// you already run (http://localhost:8000/tools/audition.html); it embeds each
// track via youtube.com/embed/, the same path #ytDock uses, so anything
// embed-blocked for the app fails there too. The file is gitignored.
//
// Written 2026-08-25 after a three-station curation pass (DISTORTION FIELD,
// MIDNIGHT NEON, CITY LIGHTS) in which the same throwaway probes got rebuilt
// three times. Each station taught a different failure mode, and all three are
// checked here so the next pass doesn't rediscover them:
//
//   - oEmbed 200 only proves a video exists. It says nothing about which
//     recording it is. Every classic blues title on MIDNIGHT NEON has several
//     near-identical Topic uploads across compilations, so duration is the
//     cheap way to separate an album master from a live take, a single edit or
//     a modern rework. Durations are reported; the title heuristics flag the
//     obvious ones.
//   - oEmbed 200 also says nothing about region-locking, which CITY LIGHTS is
//     badly exposed to -- Japanese label uploads are commonly geo-fenced.
//     availableCountries + the playability flags are the server-side signal.
//   - Channel provenance is per-station, not global. DISTORTION FIELD is
//     VEVO/official throughout; MIDNIGHT NEON is mostly "- Topic" because
//     pre-1970 blues has no official video; CITY LIGHTS leans on fan and
//     archive channels because the catalogue was never uploaded officially.
//     So a channel is scored against THIS station's existing tracks -- one
//     already used here is a good sign, and it's also the defence against
//     that station's mis-credit rule, since fan re-uploads are where covers
//     get labelled as originals.
//
// Read tools/station-profiles.json before proposing anything; this prints the
// target station's constraints and rejections as a reminder, but it can only
// check the mechanical half. The judgment is still yours.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
globalThis.SIGNAL_BUILD ??= 'audition'
globalThis.matchMedia ??= () => ({ matches: false })

const args = process.argv.slice(2)
const flag = (name, dflt = null) => {
  const hit = args.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
// The probe itself lives in lib/probe.mjs -- shared with check-roster.mjs
// so "is this playable" has one definition. See that file's header.
import { UA, mapLimit, oembed, playability, decayFlags } from './lib/probe.mjs'

const stationArg = flag('station')
const searches = args.filter(a => a.startsWith('--search=')).map(a => a.slice(9))
const limit = +flag('limit', 6)
const outPath = flag('out', path.join(here, 'audition.html'))
const ids = args.filter(a => !a.startsWith('--'))

// --json (2026-08-27, admin-backend pass) -- tools/admin-server.mjs runs
// this file as a child process and needs the rows as data, not as a table.
// Rather than a second code path that could drift from the printed one,
// every human line is redirected to stderr and the SAME rows array is
// serialized to stdout at the end. So the JSON consumer and the terminal
// reader are looking at identical work, and the flags below -- UNVERIFIED
// most of all -- cannot be present in one view and missing from the other.
const asJson = args.includes('--json')
if (asJson) console.log = (...a) => console.error(...a)





async function search(query, n) {
  // sp=EgIQAQ%3D%3D restricts to videos, so playlists/channels don't crowd out
  // the results. Failures are isolated per query -- a single bad search used to
  // abort the whole run, losing every other search with it.
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`
  try {
    const html = await (await fetch(url, { headers: UA })).text()
    const hits = [...new Set([...html.matchAll(/"videoId":"([\w-]{11})"/g)].map(m => m[1]))].slice(0, n)
    if (!hits.length) console.error(`  ! no results for "${query}"`)
    return hits
  } catch (err) {
    console.error(`  ! search failed for "${query}": ${err?.message ?? err}`)
    return []
  }
}

const mmss = s => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '?')
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// Not a verdict -- just the words that have meant "wrong recording" often
// enough to be worth surfacing before you spend a listen on it.
const SUSPECT = /\b(live|remix|rework|cover|karaoke|sped ?up|slowed|nightcore|8d|full album|mix)\b/i

async function assess(id, stationChannels) {
  const e = await oembed(id)
  if (!e.ok) return { id, dead: true, status: e.status, flags: decayFlags(e, {}) }
  const p = await playability(id)
  // The decay flags -- DEAD/UNVERIFIED/NOT-US/NARROW-LICENCE/NO-EMBED and the
  // playability status -- are shared with check-roster.mjs via lib/probe.mjs,
  // so a track cannot pass the roster check and fail here (or vice versa) on
  // the same evidence. What follows is audition-only: the questions you ask
  // of a CANDIDATE, which a track already on the roster has answered.
  const flags = decayFlags(e, p)
  if (SUSPECT.test(e.title)) flags.push('CHECK-VERSION')

  const source = /VEVO$/i.test(e.channel) ? 'vevo'
    : / - Topic$/.test(e.channel) ? 'topic'
      : stationChannels.has(e.channel) ? 'used-here'
        : 'unknown'
  if (source === 'unknown') flags.push('UNKNOWN-CHANNEL')
  return { id, ...e, ...p, source, flags }
}

async function main() {
  const { STATIONS, SECRET_STATIONS } = await import('../stations.js?v=audition')
  const all = [...STATIONS, ...SECRET_STATIONS]
  const station = all.find(s => s.id === stationArg)
  if (!stationArg || !station) {
    console.error(stationArg ? `No station "${stationArg}".` : 'Missing --station=<id>.')
    console.error(`Known ids: ${all.map(s => s.id).join(', ')}`)
    process.exit(2)
  }

  const rosterIds = new Map()
  for (const s of all) for (const t of s.tracks) rosterIds.set(t.youtubeId, s.id)
  const titles = new Set(station.tracks.map(t => norm(t.title)))

  // Which channels this station already trusts. Costs one oEmbed per existing
  // track, but it is the whole point of the "used-here" signal.
  process.stderr.write(`Reading ${station.callsign}'s ${station.tracks.length} existing tracks for channel provenance...\n`)
  const existing = await mapLimit(station.tracks, 6, t => oembed(t.youtubeId))
  const stationChannels = new Set(existing.filter(e => e.ok).map(e => e.channel))

  let profile = null
  try {
    const pf = JSON.parse(readFileSync(path.join(here, 'station-profiles.json'), 'utf8'))
    profile = pf.stations[station.id] ?? null
  } catch { /* profile is optional */ }

  console.log(`\n${station.callsign} (${station.id}) -- ${station.tracks.length} tracks, ` +
    `${new Set(station.tracks.map(t => t.artist)).size} artists`)
  if (profile) {
    for (const c of profile.constraints ?? []) console.log(`  ! ${c}`)
    for (const r of profile.rejections ?? []) console.log(`  x rejected before: ${r.artist} -- ${r.track}`)
  }
  console.log('')

  let candidates = ids
  if (searches.length) {
    const found = await mapLimit(searches, 3, q => search(q, limit))
    candidates = [...new Set(found.flat())]
    console.log(`${searches.length} search(es) -> ${candidates.length} candidate(s)\n`)
  }
  if (!candidates.length) {
    console.error('Nothing to check. Pass video IDs, or --search="..." to find some.')
    process.exit(2)
  }

  const rows = await mapLimit(candidates, 4, id => assess(id, stationChannels))
  for (const r of rows) {
    if (rosterIds.has(r.id)) r.flags.push(`ALREADY-ON:${rosterIds.get(r.id)}`)
    if (r.title && titles.has(norm(r.title.replace(/\s*[([].*/, '')))) r.flags.push('TITLE-ON-STATION')
    console.log(
      `${r.id}  ${mmss(r.seconds).padStart(5)}  ${String(r.source ?? '-').padEnd(11)}` +
      `${(r.channel ?? '').slice(0, 26).padEnd(27)}${(r.title ?? '').slice(0, 46)}`)
    if (r.flags.length) console.log(`${' '.repeat(14)}${r.flags.join('  ')}`)
  }

  // Run-level verdict on the probe itself. Per-row UNVERIFIED flags are easy
  // to skim past when every row carries one; a throttled run is a property of
  // the RUN, so it gets said once, loudly, at the bottom where the next
  // instruction is. Rate limits here clear on their own -- waiting is the fix,
  // not retrying harder.
  const unprobed = rows.filter(r => !r.dead && r.probed === false)
  if (unprobed.length) {
    console.log(`\n!! ${unprobed.length}/${rows.filter(r => !r.dead).length} candidate(s) could NOT be checked ` +
      `beyond oEmbed -- duration, region and embeddability are all UNKNOWN for them.`)
    console.log(`   ${[...new Set(unprobed.map(r => r.reason))].join('; ')}`)
    console.log(`   An HTTP 429 here is YouTube throttling the watch endpoint (it redirects to`)
    console.log(`   google.com/sorry). Wait it out and re-run; do not treat the rows above as clean.`)
    process.exitCode = 1
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({
      station: {
        id: station.id, callsign: station.callsign,
        trackCount: station.tracks.length,
        artistCount: new Set(station.tracks.map(t => t.artist)).size,
        channels: [...stationChannels],
      },
      profile,
      mode: searches.length ? 'search' : 'audition',
      rows,
      // Hoisted out of the rows so the dashboard cannot render a clean-looking
      // table without it. A throttled run is a property of the RUN.
      unverified: unprobed.length,
      unverifiedReasons: [...new Set(unprobed.map(r => r.reason))],
    }))
  }

  if (searches.length) {
    console.log(`\nPick the ones you want, then re-run with the IDs to build the page:\n` +
      `  node tools/audition.js --station=${station.id} <id> <id> ...`)
    return
  }

  const usable = rows.filter(r => !r.dead)
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const cards = usable.map((r, i) => `
  <section class="card">
    <h2><span class="n">${i + 1}</span> ${esc(r.title)}</h2>
    <p class="meta"><code>${esc(r.id)}</code><span class="tag">${mmss(r.seconds)}</span>
      <span class="tag">${esc(r.source)}</span><span class="tag">${esc(r.channel)}</span>
      <a href="https://www.youtube.com/watch?v=${esc(r.id)}" target="_blank" rel="noreferrer">watch &#8599;</a></p>
    ${r.flags.length
      ? `<p class="risk">${r.flags.map(esc).join(' &middot; ')}</p>`
      : '<p class="ok">No flags &mdash; still confirm it is the right recording.</p>'}
    <iframe src="https://www.youtube.com/embed/${esc(r.id)}" title="${esc(r.title)}"
      allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>
  </section>`).join('')

  writeFileSync(outPath, `<!doctype html>
<meta charset="utf-8"><title>${esc(station.callsign)} &mdash; audition</title>
<style>
  :root { color-scheme: dark }
  body { background:#0b0d10; color:#d6e2ea; font:14px/1.5 ui-monospace,Menlo,monospace; margin:0; padding:28px }
  h1 { font-size:16px; letter-spacing:.14em; color:#7fe3ff; margin:0 0 4px }
  .sub { color:#6f8494; margin:0 0 22px; max-width:66ch }
  .grid { display:grid; gap:22px; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); max-width:1500px }
  .card { border:1px solid #22323f; padding:14px; background:#111820 }
  h2 { font-size:13px; margin:0 0 6px; color:#eaf4fa }
  .n { color:#456073 }
  .meta { margin:0 0 10px; color:#6f8494; font-size:12px; display:flex; gap:9px; align-items:center; flex-wrap:wrap }
  code { color:#7fe3ff } a { color:#7fe3ff }
  .tag { border:1px solid #22323f; padding:1px 7px; color:#9db8c9 }
  .risk { margin:0 0 10px; padding:7px 9px; background:#2a1a06; border-left:3px solid #d98a2b; color:#f0c48a; font-size:12px }
  .ok { margin:0 0 10px; padding:7px 9px; border-left:3px solid #2f6b4a; color:#7fb79a; font-size:12px }
  iframe { width:100%; aspect-ratio:16/9; border:0; background:#000 }
  ul { border:1px solid #22323f; padding:14px 18px 14px 34px; margin:0 0 26px; max-width:66ch; background:#111820 }
  li { margin:3px 0 } strong { color:#eaf4fa }
</style>
<h1>${esc(station.callsign)} &mdash; ${usable.length} CANDIDATE(S)</h1>
<p class="sub">Embedded via <code>youtube.com/embed/</code>, the same path <code>#ytDock</code> uses &mdash;
anything embed-blocked for the app fails here too. Generated by <code>tools/audition.js</code>; not committed.</p>
<ul>
  <li><strong>Right recording?</strong> Duration is on each card. Machine checks cannot tell an album master from a live take or a rework.</li>
  <li><strong>Right artist?</strong> Fan re-uploads are where covers get labelled as originals.</li>
  <li><strong>Plays at all?</strong> Region and embed status were checked server-side; this confirms it in your browser.</li>
</ul>
<div class="grid">${cards}
</div>
`)

  const dead = rows.length - usable.length
  console.log(`\nWrote ${path.relative(process.cwd(), outPath)} -- ${usable.length} card(s)` +
    `${dead ? `, ${dead} unusable and left out` : ''}.`)
  console.log('Serve the repo (python3 tools/dev-server.py 8000) and open ' +
    'http://localhost:8000/tools/audition.html')
}

main().catch(err => {
  console.error('audition failed:', err)
  process.exit(2)
})
