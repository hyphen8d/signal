// SIGNAL -- the network admin backend. Localhost only, no dependencies.
//
//   node tools/admin-server.mjs [port]     # default 8080
//   then open http://127.0.0.1:8080/admin
//
// 2026-08-27. tools/network.html has been a serverless page since the 55th
// pass, reading and writing stations.js through Chrome's File System Access
// API. That was the right call for what it did then, and its ceiling was
// never its design -- it was that a page cannot run Node. Everything the
// roster work still needed a terminal for is a Node tool: audition.js,
// lint-roster.js, verify-roster.js, stamp.js, the test suite, git. And
// everything about a STATION except its tracks (crt, meter, ident, glyph,
// visual, gain, static) was not editable anywhere at all, by anyone, except
// by hand-editing stations.js.
//
// So: a small server underneath the page it already had. This file owns the
// filesystem, the child processes and git. It owns no parsing -- that is
// tools/lib/roster.mjs, imported here AND by the page, so there is exactly
// one copy of the logic that understands stations.js. The last time that
// logic was duplicated, the copy went stale and broke the dashboard; the
// header of roster.mjs carries the full story.
//
// WHAT THIS DELIBERATELY IS NOT: hosted, authenticated, or reachable off
// this box. It binds 127.0.0.1, checks the Host header, and requires a
// custom request header on every mutating route -- which a cross-origin page
// cannot send without a CORS preflight this server never answers. That last
// one matters more than it looks: this process can run `git push`, and a
// random tab in the same browser must not be able to reach it.

import http from 'node:http'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadRosterFromText, buildRosterPayload, buildStationsMd,
  patchStationTracksDetailed, patchStationField, verifyPatch,
} from './lib/roster.mjs'
import { mergeRejection } from './lib/rejections.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..')

const argv = process.argv.slice(2)
const flag = (name, dflt = null) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const PORT = +(argv.find(a => !a.startsWith('--')) || process.env.SIGNAL_ADMIN_PORT || 8080)

// --host= (2026-08-27). Loopback is the default and the right default: this
// process runs `git push`. But the machine this repo lives on is normally
// reached over SSH from somewhere else, where "127.0.0.1:8080" names the
// wrong computer entirely -- so the two ways out are a tunnel (nothing
// exposed) or an explicit bind to an interface the other machine can see.
// Neither is chosen for you; the banner below prints the tunnel command and
// this flag exists for when you'd rather not tunnel. A Tailscale address is
// a reasonable thing to hand it: that is an authenticated mesh, not the LAN.
// `--host=tailscale` resolves the tailscale0 interface's own IPv4 rather than
// hardcoding it. The address is stable per node, so hardcoding would mostly
// work -- but a systemd unit that names an IP is a unit that breaks silently
// the day the tailnet is re-created, and this way the unit says what it
// means. Fails loudly (and exits) if the interface is not up yet, which at
// boot is normal and is what Restart= is for.
function resolveHost(want) {
  if (want !== 'tailscale') return want
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (!name.startsWith('tailscale')) continue
    const v4 = (list || []).find(ni => ni.family === 'IPv4' || ni.family === 4)
    if (v4) return v4.address
  }
  console.error('--host=tailscale: no tailscale0 IPv4 yet (is tailscaled up?).')
  console.error('At boot this is normal and expected -- systemd Restart= will retry.')
  process.exit(1)
}
const HOST = resolveHost(flag('host', '127.0.0.1'))
const LOOPBACK = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1'

// Host-header allowlist. Every address this machine actually has, plus the
// loopback names -- and nothing else. That still blocks DNS rebinding, which
// works by getting a browser to send `Host: evil.com` to a local address: a
// hostname an attacker controls is not in this set, however it resolves.
function localAddresses() {
  const out = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) { out.add(ni.address); out.add(`[${ni.address}]`) }
  }
  return out
}
const ALLOWED_HOSTS = localAddresses()

globalThis.SIGNAL_BUILD ??= 'admin'
globalThis.matchMedia ??= () => ({ matches: false })

// ---------------------------------------------------------------------
// Files
//
// Writes are whitelisted by path. Not because a localhost tool is under
// attack, but because a bug in the dashboard's JS should not be able to
// address arbitrary files -- the blast radius of "the admin page wrote
// somewhere unexpected" in a repo with no build step is the repo.
// ---------------------------------------------------------------------
const WRITABLE = new Set([
  'stations.js',
  'stations.md',
  'tools/pending-tracks.json',
  'tools/station-profiles.json',
])

const abs = (rel) => path.resolve(ROOT, rel)
const inRepo = (p) => p === ROOT || p.startsWith(ROOT + path.sep)

function readRepoFile(rel) {
  const p = abs(rel)
  if (!inRepo(p)) throw new Error(`Refusing to read outside the repo: ${rel}`)
  return readFileSync(p, 'utf8')
}
function writeRepoFile(rel, text) {
  if (!WRITABLE.has(rel)) throw new Error(`Refusing to write "${rel}" -- not in the writable set`)
  const p = abs(rel)
  if (!inRepo(p)) throw new Error(`Refusing to write outside the repo: ${rel}`)
  writeFileSync(p, text)
}
function readJson(rel, fallback) {
  try { return JSON.parse(readRepoFile(rel)) } catch (e) { return fallback }
}

// ---------------------------------------------------------------------
// Child processes
// ---------------------------------------------------------------------
const testFiles = () => readdirSync(abs('tests')).filter(f => f.endsWith('.test.mjs')).sort().map(f => `tests/${f}`)

// `network: true` is surfaced in the UI rather than enforced here -- these
// reach YouTube and are slow, and a preflight that silently spent two
// minutes on the network would get run less often, which defeats it.
const TASKS = {
  lint: { label: 'lint roster', cmd: () => ['node', ['tools/lint-roster.js']] },
  test: { label: 'test suite', cmd: () => ['node', ['--test', ...testFiles()]] },
  verify: { label: 'verify roster', network: true, cmd: () => ['node', ['tools/verify-roster.js']] },
  stamp: { label: 'bump build stamp', cmd: () => ['node', ['tools/stamp.js']] },
  stations: { label: 'regenerate stations.md', cmd: () => ['node', ['tools/stations-to-md.js']] },
  deadfeedback: { label: 'input-feedback sweep', cmd: () => ['node', ['tools/dead-feedback.mjs']] },
  shoot: { label: 'regenerate screenshots', network: true, cmd: () => ['node', ['tools/shoot.mjs']] },
  health: { label: 'roster health batch', network: true, cmd: () => ['node', ['tools/check-roster.mjs']] },
}

/** Run a command, streaming every line to `emit`. Resolves with the exit
 *  code -- never rejects on a nonzero exit; that is data, not an error. */
function run(cmd, args, emit, opts = {}) {
  return new Promise((resolve) => {
    emit({ type: 'cmd', text: `$ ${cmd} ${args.join(' ')}` })
    let child
    try {
      child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...opts.env } })
    } catch (err) {
      emit({ type: 'err', text: String(err?.message ?? err) })
      resolve(1)
      return
    }
    const pump = (stream, type) => {
      let buf = ''
      stream.setEncoding('utf8')
      stream.on('data', (chunk) => {
        buf += chunk
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) emit({ type, text: line })
      })
      stream.on('end', () => { if (buf) emit({ type, text: buf }) })
    }
    pump(child.stdout, 'out')
    pump(child.stderr, 'err')
    child.on('error', (err) => { emit({ type: 'err', text: String(err?.message ?? err) }); resolve(1) })
    child.on('close', (code) => resolve(code ?? 0))
  })
}

// ---------------------------------------------------------------------
// git
// ---------------------------------------------------------------------
/** run() streams; this one collects. For the cheap read-only invocations
 *  (check-roster --report) where the caller wants a value, not a log. */
function capture(cmd, args, opts = {}) {
  let stdout = '', stderr = ''
  return run(cmd, args, (ev) => {
    if (ev.type === 'out') stdout += ev.text + '\n'
    else if (ev.type === 'err') stderr += ev.text + '\n'
  }, opts).then((code) => ({ code, stdout, stderr }))
}

function git(args) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd: ROOT })
    let out = '', err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', () => resolve({ code: 1, out: '', err: 'git not found' }))
    // `raw` is deliberately untrimmed. `git status --porcelain` is a
    // FIXED-WIDTH format -- two status columns, a space, then the path -- so
    // an unstaged modification is " M path". Trimming eats the leading space
    // and every subsequent column offset is one out, which is exactly how
    // the deploy panel came to list "ools/network.html".
    child.on('close', (code) => resolve({ code: code ?? 0, out: out.trim(), err: err.trim(), raw: out }))
  })
}

async function gitState() {
  const [branch, status, last, upstream] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD']),
    git(['status', '--porcelain']),
    git(['log', '-1', '--format=%h %s']),
    git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
  ])
  let ahead = null
  if (upstream.code === 0) {
    const c = await git(['rev-list', '--count', `${upstream.out}..HEAD`])
    if (c.code === 0) ahead = +c.out
  }
  const dirty = (status.raw || '').split('\n').filter(Boolean).map((l) => {
    // XY<space>PATH. A rename is "R  old -> new"; show the destination,
    // which is the name that will exist after the commit.
    const code = l.slice(0, 2).trim()
    let file = l.slice(3)
    const arrow = file.indexOf(' -> ')
    if (arrow !== -1) file = file.slice(arrow + 4)
    // Paths with spaces or non-ASCII come back quoted.
    if (file.startsWith('"') && file.endsWith('"')) {
      try { file = JSON.parse(file) } catch (e) { /* leave as-is */ }
    }
    return { code, file }
  })
  return {
    branch: branch.code === 0 ? branch.out : '(unknown)',
    lastCommit: last.code === 0 ? last.out : '',
    upstream: upstream.code === 0 ? upstream.out : null,
    ahead,
    dirty,
  }
}

// ---------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.bdf': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2',
  // The app fetches its liner/ident clips as ArrayBuffers, so these decoded
  // fine as application/octet-stream -- but serving audio without an audio
  // type is the sort of thing that works until something checks.
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
}

// Same reasoning as tools/dev-server.py, which this replaces for an admin
// session: a soft reload has to get the current bytes, or you spend an hour
// debugging a module graph built from a file you already fixed.
const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

function sendJson(res, code, body) {
  const text = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE })
  res.end(text)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', d => {
      buf += d
      if (buf.length > 8e6) { reject(new Error('request body too large')); req.destroy() }
    })
    req.on('end', () => {
      if (!buf) return resolve({})
      try { resolve(JSON.parse(buf)) } catch (e) { reject(new Error('invalid JSON body')) }
    })
    req.on('error', reject)
  })
}

/** Open a newline-delimited-JSON stream. Chosen over Server-Sent Events
 *  because EventSource is GET-only and every streaming route here is a POST
 *  that carries a body (which task, which station, which commit message). */
function openStream(res) {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', ...NO_STORE })
  return {
    emit: (obj) => { if (!res.writableEnded) res.write(JSON.stringify(obj) + '\n') },
    end: () => { if (!res.writableEnded) res.end() },
  }
}

// ---------------------------------------------------------------------
// Save paths
//
// Both of these follow the same discipline the serverless dashboard
// established: patch the text, PROVE the patch by re-parsing it and
// checking the value came back, and only then write. A failed check is a
// refusal to write, never a warning next to a write that already happened.
// ---------------------------------------------------------------------
function saveTracks(stationId, tracks) {
  const src = readRepoFile('stations.js')
  const { text, keptComments, droppedComments } = patchStationTracksDetailed(src, stationId, tracks)
  verifyPatch(text, stationId, tracks.length)
  writeRepoFile('stations.js', text)
  const { STATIONS } = loadRosterFromText(text)
  writeRepoFile('stations.md', buildStationsMd(STATIONS))
  // droppedComments is surfaced to the dashboard rather than swallowed. A
  // comment attached to a track you removed usually SHOULD go with it, but
  // "usually" is not "always", and this used to be silent -- 33 lines of
  // design record went with two track removals before anyone noticed.
  return { trackCount: tracks.length, keptComments, droppedComments }
}

function saveIdentity(stationId, fields) {
  const src = readRepoFile('stations.js')
  let next = src
  for (const [fieldPath, value] of Object.entries(fields)) {
    next = patchStationField(next, stationId, fieldPath, value)
  }
  verifyPatch(next, stationId, fields)
  if (next === src) return { changed: 0, unchanged: true }
  const renamed = Object.prototype.hasOwnProperty.call(fields, 'callsign')
  writeRepoFile('stations.js', next)
  // A callsign, tagline, freq or ident change all show up in stations.md,
  // so it is regenerated here for the same reason a track edit regenerates
  // it -- the generated file is never allowed to lag the source.
  const { STATIONS, SECRET_STATIONS } = loadRosterFromText(next)
  writeRepoFile('stations.md', buildStationsMd(STATIONS))
  const station = [...STATIONS, ...SECRET_STATIONS].find(s => s.id === stationId)
  return {
    changed: Object.keys(fields).length,
    warnings: renamed ? renameWarnings(station) : [],
  }
}

// A rejection has to land in BOTH stores or it is lost. CLAUDE.md's own
// warning: "Rejections live in two files and neither reads the other."
// station-profiles.json's list is the one audition.js prints back at you
// when you next consider that track, so it is the one that actually
// prevents a re-proposal; pending-tracks.json's is the queue's own record.
// Writing one without the other is how a reason gets forgotten, so this is
// the single writer for both and the reason is required.
// 2026-08-28 -- the two stores are merged through tools/lib/rejections.mjs
// now rather than appended to, and the outcome per store is reported back
// instead of assumed. See that file for why: this appended blindly, so the
// same rejection recorded by hand and then through here landed twice and
// audition.js printed it twice. The stores are deduped INDEPENDENTLY on
// purpose -- the case that found this had the profile already carrying the
// record and the queue carrying nothing, and refusing outright would have
// left that record half-written for good.
function rejectTrack({ stationId, youtubeId, title, artist, reason, entry }) {
  if (!reason || !String(reason).trim()) throw new Error('a rejection reason is required')
  const today = new Date().toISOString().slice(0, 10)
  const clean = String(reason).trim()
  const opts = { today, reason: clean }

  const profiles = readJson('tools/station-profiles.json', null)
  let profile = 'no-profile'
  if (profiles?.stations?.[stationId]) {
    const p = profiles.stations[stationId]
    const merged = mergeRejection(p.rejections, { artist, track: title, reason: clean, rejectedAt: today, youtubeId }, opts)
    profile = merged.outcome
    if (merged.outcome !== 'skipped') {
      p.rejections = merged.list
      writeRepoFile('tools/station-profiles.json', JSON.stringify(profiles, null, 2) + '\n')
    }
  }

  const pending = readJson('tools/pending-tracks.json', { pending: [], rejected: [] })
  const before = (pending.pending || []).length
  pending.pending = (pending.pending || []).filter(e => !(e.stationId === stationId && e.youtubeId === youtubeId))
  const drained = before !== pending.pending.length
  const merged = mergeRejection(pending.rejected, {
    ...(entry || {}), stationId, youtubeId, title, artist,
    rejectedAt: today, rejectedReason: clean,
  }, opts)
  if (merged.outcome !== 'skipped' || drained) {
    pending.rejected = merged.list
    writeRepoFile('tools/pending-tracks.json', JSON.stringify(pending, null, 2) + '\n')
  }

  return {
    profile, queue: merged.outcome,
    // Kept so an older caller reading `profileWritten` still sees the truth.
    profileWritten: profile === 'added' || profile === 'amended',
    alreadyRecorded: profile === 'skipped' && merged.outcome === 'skipped',
    pending,
  }
}

// ---------------------------------------------------------------------
// Boot payload -- one request the dashboard can start from.
// ---------------------------------------------------------------------
// A callsign lives in more places than stations.js, and a rename reaches
// none of them on its own. 2026-08-28: MIDNIGHT NEON became SYNAPSE and the
// station kept announcing its old name out loud for as long as it took
// someone to think of checking, because the spoken clip is resolved from the
// station's id (which correctly did not change). The curation profile still
// described the old lane too, and that one feeds audition.js.
//
// Both are things the server can see, so it says so rather than leaving it
// to be noticed. This is a WARNING, never a refusal -- the divergence is
// legitimate and expected in the window between renaming a station and
// re-recording its ident.
function renameWarnings(station) {
  const out = []
  if (!station) return out

  const profile = readJson('tools/station-profiles.json', { stations: {} })?.stations?.[station.id]
  if (profile && profile.callsign && profile.callsign !== station.callsign) {
    out.push({
      kind: 'profile',
      file: 'tools/station-profiles.json',
      detail: `still calls this station "${profile.callsign}". audition.js reads this file and prints it back at you, `
        + `so candidate picks for ${station.callsign} will be judged against ${profile.callsign}'s lane.`,
    })
  }

  // The clip resolved by convention vs. the one voice.js actually maps to.
  // Read rather than imported: voice.js pulls in the WebAudio chain at load,
  // which this process has no business touching.
  let mapped = station.id
  try {
    const voice = readRepoFile('audio/voice.js')
    const block = voice.match(/const STATION_ID_CLIPS = \{([\s\S]*?)\}/)?.[1] ?? ''
    const hit = block.match(new RegExp(`['"]${station.id}['"]\\s*:\\s*['"]([\\w-]+)['"]`))
    if (hit) mapped = hit[1]
  } catch (e) { /* leave as the convention */ }
  const slug = station.callsign.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (existsSync(abs(`audio/station-id-${mapped}.mp3`)) && mapped !== slug) {
    out.push({
      kind: 'audio',
      file: `audio/station-id-${mapped}.mp3`,
      detail: `is the clip this station plays on lock, but the callsign is now "${station.callsign}". `
        + `If that recording says something else, the station announces a name that is not on the screen. `
        + `Fix by adding an entry to STATION_ID_CLIPS in audio/voice.js.`,
    })
  }
  return out
}

async function bootState() {
  const src = readRepoFile('stations.js')
  const roster = buildRosterPayload(src)
  const [{ VISUALS }, bdf, tuning] = await Promise.all([
    import('../visuals/index.js?v=admin'),
    import('../src/bdf.js'),
    import('../tuning.js?v=admin'),
  ])
  const { TAGLINE_MAX } = await import('./lint-roster.js')
  // SCREEN is the CRT baseline every station's `crt: {}` is an override on
  // top of (crt-hooks.js: `{ ...SCREEN, ...station.crt }`). The editor shows
  // it as the fallback for each field, so "no value here" reads as a real
  // number rather than as blank.
  const { SCREEN } = await import('../config.js?v=admin')
  const font = bdf.parseBDF(readRepoFile('fonts/ter-u16n.bdf'))
  return {
    roster,
    pending: readJson('tools/pending-tracks.json', { pending: [], rejected: [] }),
    profiles: readJson('tools/station-profiles.json', { stations: {} }),
    visuals: Object.keys(VISUALS),
    screenDefaults: SCREEN,
    // Sent whole so the glyph field can validate on every keystroke without
    // a round trip. ~1150 codepoints; the JSON is a few KB.
    glyphs: [...font.glyphs.keys()],
    limits: {
      TAGLINE_MAX,
      FREQ_MIN: tuning.FREQ_MIN, FREQ_MAX: tuning.FREQ_MAX,
      LOCK_THRESHOLD: tuning.LOCK_THRESHOLD,
      MIN_TRACKS: 10, IDENT_TONES: 4, MAX_PUBLIC_STATIONS: 9,
    },
    tasks: Object.fromEntries(Object.entries(TASKS).map(([k, v]) => [k, { label: v.label, network: !!v.network }])),
    build: readJson('build.json', null),
    git: await gitState(),
  }
}

// ---------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------
async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^\/api\//, '')
  const mutating = req.method !== 'GET'

  // A cross-origin page cannot set this header without a CORS preflight,
  // and this server answers no preflight and sends no CORS headers -- so a
  // hostile tab in the same browser cannot reach any route that writes a
  // file, runs a process, or pushes to a remote.
  if (mutating && req.headers['x-signal-admin'] !== '1') {
    return sendJson(res, 403, { error: 'missing X-Signal-Admin header' })
  }

  if (route === 'state' && req.method === 'GET') return sendJson(res, 200, await bootState())
  if (route === 'git' && req.method === 'GET') return sendJson(res, 200, await gitState())

  // The dashboard fetches the raw source so it can run the SAME patchers
  // this server runs, client-side, and show you the exact lines a save will
  // change before you commit to it. That preview is the only honest proof
  // that the field patcher touches nothing else -- and it is only possible
  // because both sides import tools/lib/roster.mjs.
  if (route === 'source' && req.method === 'GET') {
    return sendJson(res, 200, { text: readRepoFile('stations.js') })
  }

  if (route === 'roster' && req.method === 'GET') {
    return sendJson(res, 200, buildRosterPayload(readRepoFile('stations.js')))
  }

  if (route === 'save-tracks' && req.method === 'POST') {
    const { stationId, tracks } = await readBody(req)
    if (!stationId || !Array.isArray(tracks)) return sendJson(res, 400, { error: 'stationId and tracks[] required' })
    try { return sendJson(res, 200, { ok: true, ...saveTracks(stationId, tracks) }) }
    catch (err) { return sendJson(res, 409, { error: String(err?.message ?? err) }) }
  }

  if (route === 'save-identity' && req.method === 'POST') {
    const { stationId, fields } = await readBody(req)
    if (!stationId || !fields || typeof fields !== 'object') return sendJson(res, 400, { error: 'stationId and fields{} required' })
    try { return sendJson(res, 200, { ok: true, ...saveIdentity(stationId, fields) }) }
    catch (err) { return sendJson(res, 409, { error: String(err?.message ?? err) }) }
  }

  if (route === 'pending' && req.method === 'POST') {
    const body = await readBody(req)
    try {
      writeRepoFile('tools/pending-tracks.json', JSON.stringify({
        pending: body.pending || [], rejected: body.rejected || [],
      }, null, 2) + '\n')
      return sendJson(res, 200, { ok: true })
    } catch (err) { return sendJson(res, 409, { error: String(err?.message ?? err) }) }
  }

  if (route === 'reject' && req.method === 'POST') {
    const body = await readBody(req)
    try { return sendJson(res, 200, { ok: true, ...rejectTrack(body) }) }
    catch (err) { return sendJson(res, 400, { error: String(err?.message ?? err) }) }
  }

  if (route === 'run' && req.method === 'POST') {
    const { task } = await readBody(req)
    const spec = TASKS[task]
    if (!spec) return sendJson(res, 400, { error: `unknown task "${task}"` })
    const s = openStream(res)
    const [cmd, args] = spec.cmd()
    const code = await run(cmd, args, s.emit)
    s.emit({ type: 'exit', code, task })
    return s.end()
  }

  if (route === 'preflight' && req.method === 'POST') {
    const { includeNetwork } = await readBody(req)
    const s = openStream(res)
    // Order is deliberate: lint is instant and catches the mechanical
    // roster errors, the suite is ~2s, and verify goes to the network. No
    // point spending 90s on oEmbed for a roster that fails lint.
    const steps = ['lint', 'test', ...(includeNetwork ? ['verify'] : [])]
    let failed = null
    for (const task of steps) {
      s.emit({ type: 'step', task, label: TASKS[task].label })
      const [cmd, args] = TASKS[task].cmd()
      const code = await run(cmd, args, s.emit)
      s.emit({ type: 'step-done', task, code })
      if (code !== 0) { failed = task; break }
    }
    s.emit({ type: 'exit', code: failed ? 1 : 0, failed })
    return s.end()
  }

  if (route === 'ship' && req.method === 'POST') {
    const { message, confirm, includeNetwork } = await readBody(req)
    if (confirm !== true) return sendJson(res, 400, { error: 'ship requires confirm:true' })
    if (!message || !String(message).trim()) return sendJson(res, 400, { error: 'a commit message is required' })
    const s = openStream(res)
    const before = await gitState()
    s.emit({ type: 'info', text: `branch ${before.branch}${before.upstream ? ` -> ${before.upstream}` : ' (no upstream)'}` })

    // stamp FIRST. main.js fetches build.json and imports every module as
    // ?v=<stamp>; without a bump, GitHub Pages' 10-minute cache can leave a
    // visitor on the previous build. It is the step most easily forgotten
    // by hand, which is the whole argument for this button existing.
    const pipeline = [
      ['stamp', 'bumping build stamp'],
      ['stations', 'regenerating stations.md'],
      ['lint', 'linting roster'],
      ['test', 'running the suite'],
      ...(includeNetwork ? [['verify', 'verifying every track (network)']] : []),
    ]
    for (const [task, label] of pipeline) {
      s.emit({ type: 'step', task, label })
      const [cmd, args] = TASKS[task].cmd()
      const code = await run(cmd, args, s.emit)
      s.emit({ type: 'step-done', task, code })
      if (code !== 0) {
        s.emit({ type: 'err', text: `${label} failed -- nothing committed, nothing pushed.` })
        s.emit({ type: 'exit', code: 1, failed: task })
        return s.end()
      }
    }
    for (const [label, args] of [
      ['staging', ['add', '-A']],
      ['committing', ['commit', '-m', String(message).trim()]],
      ['pushing', ['push']],
    ]) {
      s.emit({ type: 'step', task: label, label })
      const code = await run('git', args, s.emit)
      s.emit({ type: 'step-done', task: label, code })
      if (code !== 0) {
        s.emit({ type: 'err', text: `${label} failed -- stopping here.` })
        s.emit({ type: 'exit', code: 1, failed: label })
        return s.end()
      }
    }
    s.emit({ type: 'git', state: await gitState() })
    s.emit({ type: 'exit', code: 0 })
    return s.end()
  }

  // Roster health. Two routes because the two things cost wildly different
  // amounts: reading the record is a file read, running a batch is minutes of
  // network. The panel renders from GET on every open and only spends the
  // network when asked.
  if (route === 'health' && req.method === 'GET') {
    const out = await capture('node', ['tools/check-roster.mjs', '--report', '--json'])
    let parsed = null
    try { parsed = JSON.parse(out.stdout) } catch (e) {}
    if (!parsed) return sendJson(res, 500, { error: out.stderr.trim() || 'check-roster --report produced no JSON' })
    // The record says what the roster looks like. It cannot say whether
    // anything is still LOOKING -- a stopped timer and a quiet one are the
    // same file. So the scheduled watcher's own state rides along on the
    // same request: no second round trip, and the panel cannot render
    // coverage without also being able to say when it was last advanced.
    // Attached rather than fatal if it fails: this route's job is the
    // roster, and losing the liveness strip must not cost the findings.
    let watch = null
    try {
      const w = await capture('node', ['tools/roster-watch.mjs', '--status', '--json'])
      watch = JSON.parse(w.stdout)
    } catch (e) {}
    return sendJson(res, 200, { ...parsed, watch })
  }
  if (route === 'health' && req.method === 'POST') {
    const { batch, stationId } = await readBody(req)
    const args = ['tools/check-roster.mjs', '--json']
    if (batch) args.push(`--batch=${Math.max(1, Math.min(200, +batch || 40))}`)
    if (stationId) args.push(`--station=${stationId}`)
    const s2 = openStream(res)
    let json = ''
    const code = await run('node', args, (ev) => {
      // Same split as the audition route: --json owns stdout, every human
      // line is on stderr, so progress streams while the result is collected.
      if (ev.type === 'out') { json += ev.text + '\n'; return }
      s2.emit(ev)
    })
    let parsed = null
    try { parsed = JSON.parse(json) } catch (e) {}
    s2.emit({ type: 'result', result: parsed, raw: parsed ? undefined : json })
    s2.emit({ type: 'exit', code })
    return s2.end()
  }

  // Listening share (2026-08-31). Sits beside ROSTER HEALTH because the two
  // answer each other: that panel says which tracks are still playable, this
  // one says whether anybody is listening to the station they are on. A
  // station with immaculate health and no listening minutes is a curation
  // question, and neither panel can raise it alone.
  //
  // A PROXY, not a store. The data lives in the collector (see
  // tools/collector/), and the dashboard cannot reach it directly: the read
  // token would have to be in the page, where it would be readable by
  // anything that can read the page. So the token stays in this process's
  // environment and the browser asks this server instead.
  if (route === 'listening' && req.method === 'GET') {
    const base = process.env.SIGNAL_STATS_URL
    const token = process.env.SIGNAL_STATS_TOKEN
    // Not an error. The overwhelmingly likely reason there is no collector
    // configured is that nobody has deployed one, which is the DEFAULT
    // state of this repo -- so it answers with what is true and lets the
    // panel say so, rather than rendering as a failure the reader then has
    // to diagnose.
    if (!base || !token) {
      return sendJson(res, 200, { configured: false, days: [] })
    }
    try {
      const r = await fetch(`${base}?days=30`, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) return sendJson(res, 502, { error: `collector returned HTTP ${r.status}` })
      const data = await r.json()
      return sendJson(res, 200, { configured: true, ...data })
    } catch (err) {
      return sendJson(res, 502, { error: `collector unreachable: ${String(err?.message ?? err)}` })
    }
  }

  if (route === 'audition' && req.method === 'POST') {
    const { stationId, ids = [], searches = [], limit } = await readBody(req)
    if (!stationId) return sendJson(res, 400, { error: 'stationId required' })
    const args = ['tools/audition.js', `--station=${stationId}`, '--json']
    if (limit) args.push(`--limit=${+limit}`)
    for (const q of searches) if (String(q).trim()) args.push(`--search=${q}`)
    for (const id of ids) if (/^[\w-]{11}$/.test(String(id).trim())) args.push(String(id).trim())
    const s = openStream(res)
    let json = ''
    const code = await run('node', args, (ev) => {
      // audition --json puts its payload on stdout between markers and
      // everything human on stderr, so progress still streams while the
      // structured result is collected.
      if (ev.type === 'out') { json += ev.text + '\n'; return }
      s.emit(ev)
    })
    let parsed = null
    try { parsed = JSON.parse(json) } catch (e) { /* left null; the UI falls back to the log */ }
    s.emit({ type: 'result', result: parsed, raw: parsed ? undefined : json })
    s.emit({ type: 'exit', code })
    return s.end()
  }

  return sendJson(res, 404, { error: `no route ${req.method} /api/${route}` })
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  if (rel === '' ) rel = 'index.html'
  if (rel === 'admin' || rel === 'admin/') rel = 'tools/network.html'
  // Keeps the console clean. The dashboard does declare an icon now (an
  // inline SVG data URI in network.html's head, the app's favicon in the
  // blue tint), but a browser that probes /favicon.ico anyway shouldn't
  // put a 404 in the log for it.
  if (rel === 'favicon.ico') { res.writeHead(204, NO_STORE); return res.end() }
  const p = path.resolve(ROOT, rel)
  if (!inRepo(p) || !existsSync(p) || !readdirSafeIsFile(p)) {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...NO_STORE })
    return res.end('not found')
  }
  const type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type, ...NO_STORE })
  res.end(readFileSync(p))
}
function readdirSafeIsFile(p) {
  try { return !readdirSync(path.dirname(p), { withFileTypes: true }).find(d => d.name === path.basename(p))?.isDirectory() } catch (e) { return true }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)

  // Defence in depth against DNS rebinding: a name that resolves to
  // 127.0.0.1 would otherwise let a remote page talk to a server that only
  // ever bound to loopback.
  const raw = req.headers.host || ''
  const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0]
  if (host && !ALLOWED_HOSTS.has(host)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    return res.end(`this server does not answer to the host "${host}"`)
  }

  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url)
    return serveStatic(req, res, url)
  } catch (err) {
    if (!res.headersSent) sendJson(res, 500, { error: String(err?.message ?? err) })
    else res.end()
    console.error('admin-server:', err)
  }
})

server.on('error', (err) => {
  // Binding a non-local address. Under the systemd unit this is what a boot
  // race with tailscaled looks like; the default Restart=on-failure retries
  // until the interface exists, so this is informational, not fatal-forever.
  if (err.code === 'EADDRNOTAVAIL') {
    console.error(`Cannot bind ${HOST} -- no interface currently has that address.`)
    console.error('If this is tailscale, tailscaled may not be up yet. Check: tailscale ip -4')
    process.exit(1)
  }
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use -- tools/dev-server.py may be on it.`)
    console.error(`This server serves the app too, so run it INSTEAD, or pick another port:`)
    console.error(`  node tools/admin-server.mjs 8081`)
    process.exit(1)
  }
  throw err
})

server.listen(PORT, HOST, () => {
  const shown = LOOPBACK ? '127.0.0.1' : HOST
  console.log(`SIGNAL admin  ->  http://${shown}:${PORT}/admin`)
  console.log(`the app       ->  http://${shown}:${PORT}/  (no-store, same as tools/dev-server.py)`)

  // Over SSH those URLs name the machine you are sitting at, not this one.
  // Say so, with the command, rather than printing a link that cannot work.
  if (process.env.SSH_CONNECTION && LOOPBACK) {
    // SSH_CONNECTION's third field is the address on THIS box that the other
    // machine actually connected to -- so it is, by construction, one it can
    // reach. Printing it beats a generic <addr> placeholder, and on this
    // setup it is the Tailscale address.
    const reachable = process.env.SSH_CONNECTION.split(' ')[2] || os.hostname()
    console.log('')
    console.log('SSH session detected: those URLs name YOUR machine, not this one.')
    console.log('Loopback is the default because this server commits and pushes. Two ways over:')
    console.log('')
    console.log(`  1. bind the address you SSH'd in on (reachable from your side by definition):`)
    console.log(`       npm run admin -- --host=${reachable} ${PORT}`)
    console.log(`     then open  http://${reachable}:${PORT}/admin`)
    console.log('')
    console.log(`  2. or tunnel, exposing nothing:`)
    console.log(`       ssh -N -L ${PORT}:127.0.0.1:${PORT} ${os.userInfo().username}@${reachable}`)
    console.log(`     then open  http://127.0.0.1:${PORT}/admin`)
    console.log(`     (in a live session: press  ~C  then  -L ${PORT}:127.0.0.1:${PORT})`)
  }
  if (!LOOPBACK) {
    console.log('')
    console.log(`!! Bound to ${HOST}, not loopback. Anything that can reach this address can`)
    console.log('   edit the roster, run the toolchain, and commit and push to the remote.')
    console.log('   There is no password on it. Only do this on a network you trust.')
  }
})
