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
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  loadRosterFromText, buildRosterPayload, buildStationsMd,
  patchStationTracksDetailed, patchStationField, verifyPatch,
} from './lib/roster.mjs'
import { mergeRejection } from './lib/rejections.mjs'
import { parsePorcelain, inProgressBlockers } from './lib/git-checks.mjs'

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
// 2026-09-02 (audit, L8) -- a bare `--host=` used to parse as '' and
// server.listen(PORT, '') binds EVERY interface: a typo away from putting a
// server that can `git push` on the open LAN, silently, on the machine's
// most security-relevant flag. An empty value is an error, not a default.
if (!HOST) {
  console.error('--host= needs a value (an address, or "tailscale"). An empty one would bind every interface.')
  process.exit(1)
}
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
  // 2026-09-02 (audit, L9) -- write-to-temp then rename, so a crash
  // mid-write can never leave a truncated stations.js or a half-written
  // JSON store behind: rename within one directory is atomic, and the old
  // file stays whole until the new one fully exists. (Two dashboard tabs
  // racing each other can still last-write-wins -- that is a lock, not
  // this, and a single-user tool does not carry one.)
  const tmp = tmpPathFor(p)
  writeFileSync(tmp, text)
  renameSync(tmp, p)
}
// 2026-09-12 (audit, M9) -- the temp file is DOT-PREFIXED, and the reason
// is the SHIP route further down: it stages with `git add -A`, so a crash
// between the write and the rename used to leave `stations.js.tmp-1234` at
// the repo root, ignored by nothing, for the next SHIP to commit and push
// to the public repo -- the same mechanism that shipped an audit doc marked
// untracked-on-purpose. `.gitignore` now carries `*.tmp-*` as well; the dot
// prefix is the half that ALSO keeps the residue off HTTP, since servable()
// refuses any dot-prefixed segment and a half-written roster is not a file
// this server should ever hand out. Exported so the test can pin both.
export const tmpPathFor = (p) => path.join(path.dirname(p), `.${path.basename(p)}.tmp-${process.pid}`)
function readJson(rel, fallback) {
  try { return JSON.parse(readRepoFile(rel)) } catch (e) { return fallback }
}
// 2026-10-15 (admin audit, C-H2) -- the WRITE paths must not use readJson's
// fallback. It answered a parse error exactly like a missing file, so a
// pending-tracks.json with a merge-conflict marker in it read as empty, and
// the next rejection wrote "empty + one record" over it: 38 rejections and
// 26KB of curation record became 222 bytes, the route said ok, and the
// result was valid JSON, so lint, the suite and SHIP all waved it through.
// Absent is still a fresh start; unparseable is a refusal that names the file.
function readJsonForWrite(rel, fallback) {
  let text
  try { text = readRepoFile(rel) } catch (e) {
    if (e?.code === 'ENOENT') return fallback
    throw e
  }
  try { return JSON.parse(text) } catch (e) {
    throw new Error(`${rel} is not valid JSON (${e.message}) -- refusing to overwrite it. Fix the file by hand first.`)
  }
}
// 2026-10-15 (admin audit, C-M1) -- written in the file's OWN indent.
// station-profiles.json has been 1-space since 2026-09-02 and this wrote it
// back 2-space, so one rejection was a 3,100-line diff around a 7-line
// change: buried in SHIP's commit and fatal to git blame on the curation
// record. Inferred from the existing text, not hardcoded per file, so a
// reformat by hand is followed rather than fought.
function writeJsonKeepingIndent(rel, obj) {
  let indent = 2
  try {
    const m = /\n( +)\S/.exec(readRepoFile(rel))
    if (m) indent = m[1].length
  } catch (e) {}
  writeRepoFile(rel, JSON.stringify(obj, null, indent) + '\n')
}
// A content hash the dashboard carries from load to save (see C-M2 below).
const hashOf = (text) => createHash('sha1').update(text).digest('hex')
const fileHash = (rel) => { try { return hashOf(readRepoFile(rel)) } catch (e) { return null } }
// 2026-10-15 (admin audit, C-M2) -- a save from a page that loaded an older
// copy of the file is refused, not applied. save-tracks sends a station's
// WHOLE track list as the page saw it, so a hand edit made after the page
// loaded (a re-pointed id, the kind 9ff7a9d made) was silently reverted by
// the next unrelated title edit; the queue save had the same shape. The page
// sends the hash it loaded and gets a 409 with `stale: true` on a mismatch.
function staleCheck(rel, baseHash, required) {
  const stale = (msg) => Object.assign(new Error(msg), { stale: true })
  if (!baseHash) {
    if (required) throw stale(`this page did not say which version of ${rel} it loaded -- reload the dashboard`)
    return
  }
  if (fileHash(rel) !== baseHash) {
    throw stale(`${rel} changed on disk since this page loaded -- reload, then redo the edit (nothing was written)`)
  }
}

// ---------------------------------------------------------------------
// Child processes
// ---------------------------------------------------------------------
const testFiles = () => readdirSync(abs('tests')).filter(f => f.endsWith('.test.mjs')).sort().map(f => `tests/${f}`)

// `network: true` is surfaced in the UI rather than enforced here -- these
// reach YouTube and are slow, and a preflight that silently spent two
// minutes on the network would get run less often, which defeats it.
//
// 2026-09-12 (audit, M10) -- `shoot` is pointed at THIS server, not at the
// deployed site. tools/shoot.mjs defaults to the Pages URL, which is right
// from a terminal after a deploy and wrong from here: the dashboard's whole
// reason for running it is "I changed a screen, re-shoot it, SHIP" -- and
// against production that captured the PREVIOUS deploy and SHIP committed
// the stale shots as fresh, the exact rot the tool exists to stop. This
// process already serves the working tree no-store, so it is the honest
// target; the URL is the address this server actually bound, because the
// systemd unit binds the tailnet and 127.0.0.1 would not reach it there.
const localAppUrl = () => `http://${LOOPBACK ? '127.0.0.1' : (HOST.includes(':') ? `[${HOST}]` : HOST)}:${PORT}/`
export const TASKS = {
  lint: { label: 'lint roster', cmd: () => ['node', ['tools/lint-roster.js']] },
  test: { label: 'test suite', cmd: () => ['node', ['--test', ...testFiles()]] },
  verify: { label: 'verify roster', network: true, cmd: () => ['node', ['tools/verify-roster.js']] },
  stamp: { label: 'bump build stamp', cmd: () => ['node', ['tools/stamp.js']] },
  stations: { label: 'regenerate stations.md', cmd: () => ['node', ['tools/stations-to-md.js']] },
  deadfeedback: { label: 'input-feedback sweep', cmd: () => ['node', ['tools/dead-feedback.mjs']] },
  shoot: { label: 'regenerate screenshots', network: true, cmd: () => ['node', ['tools/shoot.mjs', `--url=${localAppUrl()}`]] },
  health: { label: 'roster health batch', network: true, cmd: () => ['node', ['tools/check-roster.mjs']] },
}

/** Run a command, streaming every line to `emit`. Resolves with the exit
 *  code -- never rejects on a nonzero exit; that is data, not an error. */
function run(cmd, args, emit, opts = {}) {
  return new Promise((resolve) => {
    emit({ type: 'cmd', text: `$ ${cmd} ${args.join(' ')}` })
    let child
    try {
      // 2026-10-15 (admin audit, C-L2, C-M4) -- stdin is closed (an open
      // pipe nobody writes to hangs any child that waits for EOF), every
      // child has a ceiling (a stalled `git push` used to hang the stream
      // forever), and `signal` lets a route kill the child when the browser
      // that asked for it goes away. Callers pass no signal for the git
      // steps of SHIP, which must never be killed half-way.
      child = spawn(cmd, args, {
        cwd: ROOT, env: { ...process.env, ...opts.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: opts.timeoutMs ?? 20 * 60_000,
        ...(opts.signal ? { signal: opts.signal } : {}),
      })
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
    // `settled` because an aborted or timed-out child fires BOTH 'error'
    // and 'close'. A killed child reports code null -- that is a failure,
    // not the success `code ?? 0` used to make of it.
    let settled = false
    const done = (code) => { if (!settled) { settled = true; resolve(code) } }
    child.on('error', (err) => { emit({ type: 'err', text: String(err?.message ?? err) }); done(1) })
    child.on('close', (code, signal) => {
      if (code === null) emit({ type: 'err', text: `killed (${signal || 'signal'})` })
      done(code ?? 1)
    })
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
    const child = spawn('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 })
    let out = '', err = ''
    // 2026-10-15 (admin audit, C-H1) -- decoded as a stream, not chunk by
    // chunk, or a commit subject with a multibyte character split across
    // two chunks shows up mangled.
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
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
  // The porcelain parse (fixed-width columns, renames, quoted paths) lives
  // in tools/lib/git-checks.mjs since 2026-10-20, shared with tools/ship.mjs.
  const dirty = parsePorcelain(status.raw)
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
  // 2026-09-22 -- the demo recording (tools/record-demo.mjs). Without these
  // the allowlist serves them as application/octet-stream and a browser
  // downloads the file instead of playing it.
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm',
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
    // 2026-10-15 (admin audit, C-H1) -- `buf += d` on raw Buffer chunks
    // decoded each chunk on its own, so a multibyte character split across
    // two TCP segments became U+FFFD -- and was WRITTEN to stations.js:
    // 'Sigur R\uFFFD\uFFFDs' went through save-tracks with a 200, and lint
    // passed it. Loopback tends to deliver a body in one chunk, which is why
    // it never showed; over the tailnet, where the unit binds, it does not.
    // setEncoding makes the stream decoder carry partial characters over.
    req.setEncoding('utf8')
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
  // The full check (2026-10-15): which tracks, in order, and that every other
  // station came through untouched -- not just the count.
  verifyPatch(text, stationId, tracks, { before: src })
  writeRepoFile('stations.js', text)
  const { STATIONS } = loadRosterFromText(text)
  writeRepoFile('stations.md', buildStationsMd(STATIONS))
  // droppedComments is surfaced to the dashboard rather than swallowed. A
  // comment attached to a track you removed usually SHOULD go with it, but
  // "usually" is not "always", and this used to be silent -- 33 lines of
  // design record went with two track removals before anyone noticed.
  return { trackCount: tracks.length, keptComments, droppedComments }
}

async function saveIdentity(stationId, fields) {
  const src = readRepoFile('stations.js')
  let next = src
  for (const [fieldPath, value] of Object.entries(fields)) {
    next = patchStationField(next, stationId, fieldPath, value)
  }
  verifyPatch(next, stationId, fields, { before: src })
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
    warnings: renamed ? await renameWarnings(station) : [],
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

  // 2026-10-15 (admin audit, S-L2, C-L3) -- hasOwn, not a bare index:
  // stationId "__proto__" reached Object.prototype and set `rejections` on
  // every object in the process ("hasOwnProperty" reported 'added' too).
  // And readJsonForWrite, so a malformed profiles file is reported as
  // malformed instead of as "no profile entry for this station".
  const profiles = readJsonForWrite('tools/station-profiles.json', null)
  let profile = 'no-profile'
  if (profiles?.stations && Object.hasOwn(profiles.stations, stationId)) {
    const p = profiles.stations[stationId]
    const merged = mergeRejection(p.rejections, { artist, track: title, reason: clean, rejectedAt: today, youtubeId }, opts)
    profile = merged.outcome
    if (merged.outcome !== 'skipped') {
      p.rejections = merged.list
      writeJsonKeepingIndent('tools/station-profiles.json', profiles)
    }
  }

  const pending = readJsonForWrite('tools/pending-tracks.json', { pending: [], rejected: [] })
  const before = (pending.pending || []).length
  pending.pending = (pending.pending || []).filter(e => !(e.stationId === stationId && e.youtubeId === youtubeId))
  const drained = before !== pending.pending.length
  const merged = mergeRejection(pending.rejected, {
    ...(entry || {}), stationId, youtubeId, title, artist,
    rejectedAt: today, rejectedReason: clean,
  }, opts)
  if (merged.outcome !== 'skipped' || drained) {
    pending.rejected = merged.list
    writeJsonKeepingIndent('tools/pending-tracks.json', pending)
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
export async function renameWarnings(station) {
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

  // The clip this station really plays on lock, from the player's own resolver.
  //
  // 2026-09-13 (audit, M4) -- this used to regex audio/voice.js for
  // `const STATION_ID_CLIPS = {`. The map moved to audio/station-id-clips.js
  // (voice.js only re-exports it), the regex matched nothing, and every
  // station fell back to its id -- so SYNAPSE (id 'midnight-neon') was checked
  // against the RETIRED station-id-midnight-neon.mp3 and warned that it
  // announces a name not on the screen, while the app plays
  // station-id-synapse.mp3. station-id-clips.js is pure data with no imports,
  // so it is imported rather than read -- the reason voice.js was read (it
  // pulls in the WebAudio chain) never applied to it. Keyed on the file's
  // mtime for the same reason bootState()'s imports are: an edited map is
  // seen on the next save without a unit restart.
  let clipPath = `audio/station-id-${station.id}.mp3`
  try {
    let mtime = 0
    try { mtime = Math.floor(statSync(abs('audio/station-id-clips.js')).mtimeMs) } catch (e) { /* key 0 */ }
    const { stationIdClipPath } = await import(`../audio/station-id-clips.js?v=admin-${mtime}`)
    clipPath = stationIdClipPath(station.id)
  } catch (e) { /* leave as the convention */ }
  const clipName = path.basename(clipPath, '.mp3').replace(/^station-id-/, '')
  const slug = station.callsign.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (existsSync(abs(clipPath)) && clipName !== slug) {
    out.push({
      kind: 'audio',
      file: clipPath,
      detail: `is the clip this station plays on lock, but the callsign is now "${station.callsign}". `
        + `If that recording says something else, the station announces a name that is not on the screen. `
        + `Fix by re-recording it, or by mapping the id to a new clip in STATION_CLIP_NAMES in audio/station-id-clips.js.`,
    })
  }
  return out
}

async function bootState() {
  const src = readRepoFile('stations.js')
  const roster = buildRosterPayload(src)
  // 2026-09-02 (audit, L10) -- the `?v=` is keyed on each file's own mtime,
  // not a fixed 'admin'. A module is instanced per full URL, so the fixed
  // key meant these imports were cached for the LIFE OF THE PROCESS: edit
  // tuning.js or add a visual and the dashboard's limits/visual lists were
  // stale until a unit restart -- the "page updates, routes don't" trap
  // CLAUDE.md documents for this server's own code, reaching data, where
  // nothing documented it. An mtime key is stable between edits (no
  // unbounded module-cache growth on a busy dashboard) and fresh after
  // one. The boundary: only the named file's OWN top-level bindings
  // refresh -- its sibling imports keep their `?v=` -- which covers what
  // the payload reads (visual keys live in index.js, limits in
  // tuning.js/lint-roster.js, SCREEN in config.js).
  const mt = (rel) => { try { return Math.floor(statSync(path.join(ROOT, rel)).mtimeMs) } catch (e) { return 0 } }
  const [{ VISUALS }, bdf, tuning] = await Promise.all([
    import(`../visuals/index.js?v=admin-${mt('visuals/index.js')}`),
    import('../src/bdf.js'),
    import(`../tuning.js?v=admin-${mt('tuning.js')}`),
  ])
  const { TAGLINE_MAX, MAX_PUBLIC_STATIONS_PER_BAND } = await import(`./lint-roster.js?v=admin-${mt('tools/lint-roster.js')}`)
  // SCREEN is the CRT baseline every station's `crt: {}` is an override on
  // top of (crt-hooks.js: `{ ...SCREEN, ...station.crt }`). The editor shows
  // it as the fallback for each field, so "no value here" reads as a real
  // number rather than as blank.
  const { SCREEN } = await import(`../config.js?v=admin-${mt('config.js')}`)
  const font = bdf.parseBDF(readRepoFile('fonts/ter-u16n.bdf'))
  return {
    roster,
    // 2026-10-15 (admin audit, C-M2) -- the content hashes a save must carry
    // back. See staleCheck().
    hashes: { stations: hashOf(readRepoFile('stations.js')), pending: fileHash('tools/pending-tracks.json') },
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
      // 2026-09-02 (audit, L11) -- was `MAX_PUBLIC_STATIONS: 9`, a flat cap
      // restated here after the rule moved to 9-per-band (2026-08-31).
      // Imported from lint-roster.js now, and renamed so any future page
      // code reaching for the old flat name fails loudly instead of
      // rendering a limit that no longer exists.
      MIN_TRACKS: 10, IDENT_TONES: 4, MAX_PUBLIC_STATIONS_PER_BAND,
    },
    tasks: Object.fromEntries(Object.entries(TASKS).map(([k, v]) => [k, { label: v.label, network: !!v.network }])),
    build: readJson('build.json', null),
    git: await gitState(),
  }
}

// ---------------------------------------------------------------------
// One writer at a time (2026-10-15, admin audit S-L1 / C-M4)
//
// SHIP is minutes of stamp -> lint -> suite -> add -A -> commit -> push, and
// nothing used to stop a save from landing in the middle of it: `add -A`
// then staged a stations.js that lint and the suite had never seen, so the
// tree that shipped was not the tree that was tested. Two SHIPs interleaved
// their stamps and commits. AUDIT-2026-09-12 noted the missing lock (L21);
// this is it. In-process is enough -- this server is the only writer that
// goes through these routes -- and a refusal is a 409 that says who holds
// it, never a queue, because a save silently waiting behind a SHIP would
// land after the commit and look like it shipped.
// ---------------------------------------------------------------------
let busy = null
async function withLock(res, what, fn) {
  if (busy) return sendJson(res, 409, { error: `busy: ${busy} is running -- try again when it finishes`, busy })
  busy = what
  try { return await fn() } finally { busy = null }
}
// Fired when the browser that asked for a streaming task goes away -- a
// closed tab or a dropped SSH tunnel. Before this, closing the tab LOOKED
// like a cancel and was not: a disconnected SHIP went on to commit two
// minutes later, and re-pressing it stamped and committed a second time.
function abortOnDisconnect(res) {
  const ac = new AbortController()
  res.on('close', () => { if (!res.writableFinished) ac.abort() })
  return ac
}
// A GET that spawns two processes, coalesced: concurrent requests (several
// tabs, or a page in another tab firing no-cors GETs at a tailnet address)
// share one in-flight run instead of each spawning their own (S-L3).
let healthInFlight = null
async function healthReport() {
  if (healthInFlight) return healthInFlight
  healthInFlight = (async () => {
    const out = await capture('node', ['tools/check-roster.mjs', '--report', '--json'])
    let parsed = null
    try { parsed = JSON.parse(out.stdout) } catch (e) {}
    if (!parsed) return { error: out.stderr.trim() || 'check-roster --report produced no JSON' }
    // Track lengths for the station track lists (2026-10-15, dashboard UI).
    // Read from the record directly -- the summary carries only flagged rows.
    const records = readJson('tools/roster-health.json', { records: {} }).records || {}
    const lengths = Object.fromEntries(Object.entries(records).filter(([, r]) => r.seconds).map(([id, r]) => [id, r.seconds]))
    return { ...parsed, lengths, watch: await watchStatus() }
  })()
  try { return await healthInFlight } finally { healthInFlight = null }
}
async function watchStatus() {
  try {
    const w = await capture('node', ['tools/roster-watch.mjs', '--status', '--json'])
    return JSON.parse(w.stdout)
  } catch (e) { return null }
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
  // Would SHIP go through right now? The SAME checks SHIP runs before it
  // stamps (shipBlockers), so the Deploy panel can say so before the button
  // is pressed rather than after (2026-10-15, dashboard UI). Includes a
  // `git fetch`, so it is coalesced like the health GET.
  if (route === 'ship-check' && req.method === 'GET') return sendJson(res, 200, await shipCheck())

  // The dashboard fetches the raw source so it can run the SAME patchers
  // this server runs, client-side, and show you the exact lines a save will
  // change before you commit to it. That preview is the only honest proof
  // that the field patcher touches nothing else -- and it is only possible
  // because both sides import tools/lib/roster.mjs.
  if (route === 'source' && req.method === 'GET') {
    const text = readRepoFile('stations.js')
    return sendJson(res, 200, { text, hash: hashOf(text) })
  }

  if (route === 'roster' && req.method === 'GET') {
    return sendJson(res, 200, buildRosterPayload(readRepoFile('stations.js')))
  }

  if (route === 'save-tracks' && req.method === 'POST') {
    const { stationId, tracks, baseHash } = await readBody(req)
    if (!stationId || !Array.isArray(tracks)) return sendJson(res, 400, { error: 'stationId and tracks[] required' })
    return withLock(res, 'a track save', () => {
      try {
        staleCheck('stations.js', baseHash, true)
        return sendJson(res, 200, { ok: true, ...saveTracks(stationId, tracks), hash: hashOf(readRepoFile('stations.js')) })
      } catch (err) { return sendJson(res, 409, { error: String(err?.message ?? err), stale: !!err?.stale }) }
    })
  }

  if (route === 'save-identity' && req.method === 'POST') {
    const { stationId, fields, baseHash } = await readBody(req)
    if (!stationId || !fields || typeof fields !== 'object') return sendJson(res, 400, { error: 'stationId and fields{} required' })
    return withLock(res, 'an identity save', async () => {
      try {
        // Optional here: identity saves patch one field at a time from the
        // CURRENT file, so a stale page cannot revert someone else's edit to
        // a different field. Checked when sent, so the page can still say so.
        staleCheck('stations.js', baseHash, false)
        return sendJson(res, 200, { ok: true, ...(await saveIdentity(stationId, fields)), hash: hashOf(readRepoFile('stations.js')) })
      } catch (err) { return sendJson(res, 409, { error: String(err?.message ?? err), stale: !!err?.stale }) }
    })
  }

  // The queue as it is on disk NOW, with its hash -- what approve and
  // queue re-read immediately before changing it (2026-10-15, admin audit).
  if (route === 'pending' && req.method === 'GET') {
    return sendJson(res, 200, {
      data: readJsonForWrite('tools/pending-tracks.json', { pending: [], rejected: [] }),
      hash: fileHash('tools/pending-tracks.json'),
    })
  }

  if (route === 'pending' && req.method === 'POST') {
    const body = await readBody(req)
    return withLock(res, 'a queue save', () => {
      try {
        // 2026-10-15 (admin audit, C-M2 / dashboard MED) -- this route
        // writes the page's WHOLE in-memory queue, so a page loaded before
        // a candidate was appended to the file (CLAUDE.md's own workflow:
        // Claude writes candidates in, the operator approves) erased that
        // candidate on the next approve. The hash makes it a 409 instead,
        // and the page reloads the queue. readJsonForWrite also refuses to
        // overwrite a file that does not parse (C-H2).
        staleCheck('tools/pending-tracks.json', body.baseHash, true)
        readJsonForWrite('tools/pending-tracks.json', null)
        writeJsonKeepingIndent('tools/pending-tracks.json', { pending: body.pending || [], rejected: body.rejected || [] })
        return sendJson(res, 200, { ok: true, hash: fileHash('tools/pending-tracks.json') })
      } catch (err) { return sendJson(res, 409, { error: String(err?.message ?? err), stale: !!err?.stale }) }
    })
  }

  if (route === 'reject' && req.method === 'POST') {
    const body = await readBody(req)
    return withLock(res, 'a rejection', () => {
      try { return sendJson(res, 200, { ok: true, ...rejectTrack(body), hash: fileHash('tools/pending-tracks.json') }) }
      catch (err) { return sendJson(res, 400, { error: String(err?.message ?? err) }) }
    })
  }

  if (route === 'run' && req.method === 'POST') {
    const { task } = await readBody(req)
    const spec = TASKS[task]
    if (!spec) return sendJson(res, 400, { error: `unknown task "${task}"` })
    // Every task here either writes into the tree (stamp, stations, shoot,
    // health) or reads the tree SHIP is about to commit, so all of them
    // take the lock.
    return withLock(res, `task "${task}"`, async () => {
      const ac = abortOnDisconnect(res)
      const s = openStream(res)
      const [cmd, args] = spec.cmd()
      const code = await run(cmd, args, s.emit, { signal: ac.signal })
      s.emit({ type: 'exit', code, task })
      return s.end()
    })
  }

  if (route === 'preflight' && req.method === 'POST') {
    const { includeNetwork } = await readBody(req)
    const s = openStream(res)
    // Order is deliberate: lint is instant and catches the mechanical
    // roster errors, the suite is ~2s, and verify goes to the network. No
    // point spending 90s on oEmbed for a roster that fails lint.
    const steps = ['lint', 'test', ...(includeNetwork ? ['verify'] : [])]
    const ac = abortOnDisconnect(res)
    let failed = null
    for (const task of steps) {
      s.emit({ type: 'step', task, label: TASKS[task].label })
      const [cmd, args] = TASKS[task].cmd()
      const code = await run(cmd, args, s.emit, { signal: ac.signal })
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
    return withLock(res, 'SHIP', () => ship(req, res, String(message).trim(), includeNetwork))
  }
  return handleApiRest(req, res, url, route)
}

// 2026-10-15 (admin audit, C-M3) -- refuse BEFORE stamping, on any repo
// state where "stamp, test, add -A, commit, push" does something other than
// deploy what is on screen:
//   - not on main: Pages serves main, so SHIP from a branch is not a deploy;
//   - no upstream: the commit lands and the push fails;
//   - a merge, rebase, cherry-pick or revert in progress, or unmerged paths:
//     `add -A` marks conflicted files RESOLVED with the markers still in
//     them, and lint and the suite do not read README or CLAUDE.md;
//   - behind the remote after a fetch: main moves under you (it did twice
//     this week), and the push would be refused AFTER the commit, leaving a
//     local stamp commit that conflicts on build.json with the remote's;
//   - nothing to ship: a stamp-only deploy changes nothing anyone can see.
async function shipBlockers() {
  const st = await gitState()
  const out = []
  if (st.branch !== 'main') out.push(`on branch "${st.branch}", not main -- Pages deploys main`)
  if (!st.upstream) out.push(`${st.branch || 'this branch'} has no upstream to push to`)
  const gitDir = (await git(['rev-parse', '--git-dir'])).out || '.git'
  // In-progress merge/rebase/cherry-pick/revert and unmerged paths: shared
  // with tools/ship.mjs (2026-10-20), which ships a branch through a PR and
  // refuses the same states for the same reasons.
  out.push(...inProgressBlockers(ROOT, gitDir, st.dirty))
  if (!st.dirty.length) out.push('nothing to ship -- the working tree is clean')
  if (st.upstream && !out.length) {
    const f = await git(['fetch', '--quiet'])
    if (f.code !== 0) out.push(`could not fetch from the remote: ${f.err || 'git fetch failed'}`)
    else {
      const behind = await git(['rev-list', '--count', `HEAD..${st.upstream}`])
      if (behind.code === 0 && +behind.out > 0) out.push(`${st.upstream} is ${behind.out} commit(s) ahead of you -- pull first (git merge --ff-only)`)
    }
  }
  return { state: st, blockers: out }
}

let shipCheckInFlight = null
async function shipCheck() {
  if (busy) return { blockers: [`${busy} is running`], busy }
  if (!shipCheckInFlight) shipCheckInFlight = shipBlockers().finally(() => { shipCheckInFlight = null })
  const { state, blockers } = await shipCheckInFlight
  const behind = state.upstream ? await git(['rev-list', '--count', `HEAD..${state.upstream}`]) : null
  return { blockers, git: state, behind: behind?.code === 0 ? +behind.out : null }
}

async function ship(req, res, message, includeNetwork) {
  const s = openStream(res)
  const ac = abortOnDisconnect(res)
  const { state: before, blockers } = await shipBlockers()
  s.emit({ type: 'info', text: `branch ${before.branch}${before.upstream ? ` -> ${before.upstream}` : ' (no upstream)'}` })
  if (blockers.length) {
    for (const b of blockers) s.emit({ type: 'err', text: `cannot ship: ${b}` })
    s.emit({ type: 'exit', code: 1, failed: 'preflight' })
    return s.end()
  }
  // Restored if anything fails before the commit, so a failed SHIP does
  // not leave the stamp bumped (and three failed SHIPs three stamps up).
  const buildBefore = readRepoFile('build.json')
  const restoreStamp = () => { try { writeRepoFile('build.json', buildBefore) } catch (e) {} }

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
    const code = await run(cmd, args, s.emit, { signal: ac.signal })
    s.emit({ type: 'step-done', task, code })
    if (code !== 0) {
      restoreStamp()
      s.emit({ type: 'err', text: `${label} failed -- nothing committed, nothing pushed; build stamp restored.` })
      s.emit({ type: 'exit', code: 1, failed: task })
      return s.end()
    }
  }
  // The last point a closed tab can still cancel. The git steps below run
  // to completion once started -- killing `git commit` or `git push`
  // half-way is worse than finishing them.
  if (ac.signal.aborted) {
    restoreStamp()
    console.error('admin-server: SHIP cancelled -- the dashboard disconnected before the commit')
    return s.end()
  }
  // `add -A` stages the WHOLE working tree, not the dashboard's own edits:
  // anything untracked and not gitignored rides along with the deploy.
  // That has happened (an audit doc, 2026-09-02), and it is why every
  // scratch file the tools write is either gitignored or dot-prefixed --
  // see tmpPathFor() above. Kept as -A on purpose: SHIP is "ship what is
  // here", and a partial add would leave a tree that lint and the suite
  // just passed differing from the one that goes out.
  for (const [label, args] of [
    ['staging', ['add', '-A']],
    ['committing', ['commit', '-m', String(message).trim()]],
    ['pushing', ['push']],
  ]) {
    s.emit({ type: 'step', task: label, label })
    const code = await run('git', args, s.emit, { timeoutMs: 180_000 })
    s.emit({ type: 'step-done', task: label, code })
    if (code !== 0) {
      if (label === 'staging') restoreStamp()
      s.emit({ type: 'err', text: `${label} failed -- stopping here.` })
      // The panel's git state used to go stale on a failed step, still
      // showing the pre-SHIP tree after a commit had landed (C-M3).
      s.emit({ type: 'git', state: await gitState() })
      s.emit({ type: 'exit', code: 1, failed: label })
      return s.end()
    }
  }
  s.emit({ type: 'git', state: await gitState() })
  s.emit({ type: 'exit', code: 0 })
  return s.end()
}

async function handleApiRest(req, res, url, route) {

  // Roster health. Two routes because the two things cost wildly different
  // amounts: reading the record is a file read, running a batch is minutes of
  // network. The panel renders from GET on every open and only spends the
  // network when asked.
  if (route === 'health' && req.method === 'GET') {
    const report = await healthReport()
    if (report.error) return sendJson(res, 500, { error: report.error })
    // The record says what the roster looks like. It cannot say whether
    // anything is still LOOKING -- a stopped timer and a quiet one are the
    // same file. So the scheduled watcher's own state rides along on the
    // same request: no second round trip, and the panel cannot render
    // coverage without also being able to say when it was last advanced.
    // Attached rather than fatal if it fails: this route's job is the
    // roster, and losing the liveness strip must not cost the findings.
    return sendJson(res, 200, report)
  }
  if (route === 'health' && req.method === 'POST') {
    const { batch, stationId } = await readBody(req)
    const args = ['tools/check-roster.mjs', '--json']
    if (batch) args.push(`--batch=${Math.max(1, Math.min(200, +batch || 40))}`)
    if (stationId) args.push(`--station=${stationId}`)
    // A batch writes roster-health.json, which SHIP stages -- so it takes
    // the lock like any other writer.
    return withLock(res, 'a health batch', async () => {
      const ac = abortOnDisconnect(res)
      const s2 = openStream(res)
      let json = ''
      const code = await run('node', args, (ev) => {
        // Same split as the audition route: --json owns stdout, every human
        // line is on stderr, so progress streams while the result is collected.
        if (ev.type === 'out') { json += ev.text + '\n'; return }
        s2.emit(ev)
      }, { signal: ac.signal })
      let parsed = null
      try { parsed = JSON.parse(json) } catch (e) {}
      // 2026-10-15 (admin audit, dashboard MED) -- `watch` rides along here
      // too. The page replaces its whole health object with this result, and
      // without it the liveness strip read "roster-watch could not be read"
      // after every batch -- the one strip whose job is telling a stopped
      // timer from a quiet one, crying broken every time it was used.
      s2.emit({ type: 'result', result: parsed ? { ...parsed, watch: await watchStatus() } : null, raw: parsed ? undefined : json })
      s2.emit({ type: 'exit', code })
      return s2.end()
    })
  }

  if (route === 'audition' && req.method === 'POST') {
    const { stationId, ids = [], searches = [], limit } = await readBody(req)
    if (!stationId) return sendJson(res, 400, { error: 'stationId required' })
    const args = ['tools/audition.js', `--station=${stationId}`, '--json']
    // 2026-10-15 (admin audit, C-L3) -- a non-numeric limit used to pass
    // through as --limit=NaN.
    if (Number.isFinite(+limit) && +limit > 0) args.push(`--limit=${Math.floor(+limit)}`)
    for (const q of searches) if (String(q).trim()) args.push(`--search=${q}`)
    for (const id of ids) if (/^[\w-]{11}$/.test(String(id).trim())) args.push(String(id).trim())
    const s = openStream(res)
    const ac = abortOnDisconnect(res)
    let json = ''
    const code = await run('node', args, (ev) => {
      // audition --json puts its payload on stdout between markers and
      // everything human on stderr, so progress still streams while the
      // structured result is collected.
      if (ev.type === 'out') { json += ev.text + '\n'; return }
      s.emit(ev)
    }, { signal: ac.signal })
    let parsed = null
    try { parsed = JSON.parse(json) } catch (e) { /* left null; the UI falls back to the log */ }
    s.emit({ type: 'result', result: parsed, raw: parsed ? undefined : json })
    s.emit({ type: 'exit', code })
    return s.end()
  }

  return sendJson(res, 404, { error: `no route ${req.method} /api/${route}` })
}

// 2026-09-02 (audit, S1) -- static serving is an ALLOWLIST, and that is the
// whole point of it. This server maps URLs onto the repo ROOT, and the repo
// root is a working directory: it held `.elevenlabs-key` and
// `.elevenlabs-voice-id` in the clear, both of which this server handed to
// any tailnet peer that asked (confirmed live, 200 + the key). A denylist
// was the obvious fix and is the wrong one -- it has to anticipate `.env`,
// editor swap files, `*.pem`, a stray `stations.js.bak`, whatever the next
// secret is called -- so the rule is inverted: name what the app and the
// dashboard actually fetch, 404 everything else, and the next secret
// dropped in this directory is safe because nobody had to remember it.
//
// Derived by enumerating the real fetches, not guessed:
//   - the six asset/module dirs below, served whole (no secrets live in
//     any of them; they are what index.html imports and what voice.js and
//     config.js fetch at runtime),
//   - top-level files by extension -- this is the app's own module layer
//     (program.js, stations.js, build.json ...), and an extension gate
//     keeps adding a module from silently 404ing the way an explicit file
//     list would,
//   - and three named things under tools/: the dashboard, the two
//     audition pages (audition.js PRINTS an http URL for its generated
//     one -- that workflow is served, not file://), and lib/*.mjs, which
//     network.html imports `/tools/lib/roster.mjs` from. Everything else
//     in tools/ -- station-profiles.json, pending-tracks.json, the
//     servers themselves -- stops being reachable, which it never should
//     have been.
// Any dot-prefixed segment is refused outright, so `.git/`, `.claude/`,
// the write-temp files above and audio/'s DOT-PREFIXED scratch renders
// (`.render-*`, `.mono-*`, `.pad-*`) never reach the rules above.
// 2026-09-12 (audit, L7) -- this used to say "gitignored scratch renders",
// which overclaimed: `audio/*-test.mp3` is gitignored but not dot-prefixed,
// so it IS served (confirmed live, 200). A test clip is not a secret, and a
// rule keyed on .gitignore would be a second parser to keep in sync, so the
// line is drawn at the dot, and that is the line the rule actually holds.
// The one residual: a secret dropped at the repo root under an allowed
// extension (`secrets.json`). Narrow, and gitignored files belong outside
// the served root anyway -- see the S1 note in CLAUDE.md.
//
// A bare directory (`/audio`, `/tools/`) is refused too: nothing the app
// fetches is a listing, and tools/dev-server.py used to hand one out
// (filenames only, but filenames of records that are not served -- L6).
const STATIC_DIRS = new Set(['audio', 'fonts', 'screenshots', 'src', 'ui', 'visuals'])
const STATIC_TOP_EXT = new Set(['.js', '.json', '.html', '.md', '.ico', '.png', '.jpg', '.svg'])

// Exported (2026-09-12, M15) so the dot rule can be tested as a function:
// over HTTP a refused path and a missing path are both 404, so the only
// dot-paths the server test could probe were ones another rule already
// caught -- and mutating the dot rule away left that test green.
export function servable(rel) {
  const parts = rel.split('/')
  if (parts.some((seg) => seg.startsWith('.'))) return false
  if (parts.length === 1) return STATIC_TOP_EXT.has(path.extname(rel).toLowerCase())
  if (parts[0] === 'tools') {
    if (parts.length === 2 && parts[1].endsWith('.html')) return true
    return parts.length === 3 && parts[1] === 'lib' && parts[2].endsWith('.mjs')
  }
  return STATIC_DIRS.has(parts[0])
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
  if (!servable(rel) || !inRepo(p) || !existsSync(p) || !readdirSafeIsFile(p)) {
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

  // Defence in depth against DNS rebinding: a name that resolves to
  // 127.0.0.1 would otherwise let a remote page talk to a server that only
  // ever bound to loopback.
  // 2026-09-02 (audit, L7) -- an ABSENT Host header used to skip the check
  // entirely (`host && ...`). Browsers always send one, so the rebinding
  // defence never had the gap -- but an HTTP/1.0 or raw-socket client
  // walked straight past a guard that reads as an allowlist. Absent is now
  // refused like anything else not in the set: every legitimate client of
  // this server is a browser or curl, and both always send Host.
  const raw = req.headers.host || ''
  const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0]
  if (!host || !ALLOWED_HOSTS.has(host)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    return res.end(host ? `this server does not answer to the host "${host}"` : 'this server requires a Host header')
  }

  try {
    // 2026-10-15 (admin audit, S-M1) -- parsed HERE, after the Host check
    // and inside the try, against a fixed base. It used to be the first line
    // of the handler, built from the raw Host header: `Host: 127.0.0.1:x`
    // (or `[`, or a port past 65535) threw ERR_INVALID_URL outside any try,
    // the async handler's rejection went unhandled, and Node exited --
    // taking any in-flight SHIP with it, possibly between commit and push.
    // Any tailnet peer could do it, header or no header. Only the path and
    // query are ever read from `url`, so the base host is irrelevant.
    const url = new URL(req.url, 'http://admin.invalid')
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

// Importable without binding anything (2026-09-12, M15): the suite imports
// servable(), tmpPathFor() and TASKS. Same opt-out shape as roster-watch.mjs;
// run normally, nothing changes. An import that DID listen would collide
// with the systemd unit on 8080 and exit the test process from inside.
if (!process.env.SIGNAL_ADMIN_IMPORT) server.listen(PORT, HOST, () => {
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
