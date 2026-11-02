// tools/admin-server.mjs -- the WRITE routes and SHIP's refusals, against a
// throwaway copy of the repo (2026-10-15 admin audit).
//
// admin-server.test.mjs pins the guards and says, in its header, that SHIP
// needed "a scratch git repo with a remote" to test honestly. This is that
// repo: the working tree copied without the heavy media, its own git
// history, and a local bare repository as `origin`, so nothing here can
// reach GitHub. The server always operates on the directory it lives in, so
// it is spawned from the copy -- the real checkout is never written.
//
// Every test here is one finding from the 2026-10-15 audit, reproduced the
// way it was found and then asserted fixed.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import os from 'node:os'
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(here, '..')
const SKIP = new Set(['.git', 'screenshots', 'dist', 'node_modules'])
const MEDIA = /\.(mp3|ogg|wav|m4a|mp4|gif|jpg|png)$/i

let tmp, root, server, port

const sh = (cwd, cmd, args) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const git = (...args) => sh(root, 'git', args)

function startServer() {
  port = 20000 + Math.floor(Math.random() * 20000)
  const child = spawn(process.execPath, [path.join(root, 'tools/admin-server.mjs'), String(port)],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SIGNAL_ADMIN_IMPORT: '' } })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('admin-server did not come up in 5s')) }, 5000)
    let out = ''
    child.stdout.on('data', (d) => {
      out += d
      if (out.includes('SIGNAL admin')) { clearTimeout(timer); resolve(child) }
    })
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`exited ${code}:\n${out}`)) })
  })
}

/** A request whose body can be sent as several raw byte chunks. */
function request({ method = 'GET', path: p = '/', headers = {}, chunks = null, body = undefined } = {}) {
  return new Promise((resolve, reject) => {
    const h = { ...headers }
    if (body !== undefined) chunks = [Buffer.from(JSON.stringify(body))]
    if (chunks) { h['Content-Type'] = 'application/json'; h['Content-Length'] = chunks.reduce((n, c) => n + c.length, 0) }
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: h }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (d) => { text += d })
      res.on('end', () => { let json = null; try { json = JSON.parse(text) } catch (e) {} ; resolve({ status: res.statusCode, text, json }) })
    })
    req.on('error', reject)
    if (!chunks) return req.end()
    // Separate writes with a pause between them, so the server sees separate
    // 'data' events -- the condition the UTF-8 bug needed.
    ;(async () => {
      for (const c of chunks) { req.write(c); await new Promise((r) => setTimeout(r, 30)) }
      req.end()
    })()
  })
}
const ADMIN = { 'X-Signal-Admin': '1' }
const post = (p, body) => request({ method: 'POST', path: p, headers: ADMIN, body })
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

before(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'signal-admin-writes-'))
  root = path.join(tmp, 'sig')
  cpSync(REPO, root, { recursive: true, filter: (src) =>
    !(SKIP.has(path.basename(src)) && path.dirname(src) === REPO) && !MEDIA.test(src) })
  sh(tmp, 'git', ['init', '--bare', '-b', 'main', 'remote.git'])
  git('init', '-b', 'main')
  git('config', 'user.email', 'test@example.test'); git('config', 'user.name', 'test')
  git('add', '-A'); git('commit', '-qm', 'base')
  git('remote', 'add', 'origin', path.join(tmp, 'remote.git'))
  git('push', '-qu', 'origin', 'main')
  server = await startServer()
})
after(() => {
  server?.kill()
  if (tmp) rmSync(tmp, { recursive: true, force: true })
})
const restore = () => { git('checkout', '-q', '--', '.'); git('clean', '-qfd', '-e', 'node_modules') }

test('a multibyte character split across body chunks arrives whole (C-H1)', async () => {
  try {
    const tagline = 'Sigur Rós — 東京 test'
    const bytes = Buffer.from(JSON.stringify({ stationId: 'city-lights', fields: { tagline } }))
    const cut = bytes.indexOf(Buffer.from('ó')) + 1   // inside the two-byte ó
    const r = await request({ method: 'POST', path: '/api/save-identity', headers: ADMIN, chunks: [bytes.subarray(0, cut), bytes.subarray(cut)] })
    assert.equal(r.status, 200, r.text)
    assert.ok(read('stations.js').includes(tagline), 'the tagline was written intact')
    assert.ok(!read('stations.js').includes('�'), 'no replacement character reached stations.js')
  } finally { restore() }
})

test('an identifier-shaped key is the only kind save-identity will write (S-H1)', async () => {
  const marker = path.join(tmp, 'pwned')
  const payload = `zz: import("node:fs")["then"](f=>f["writeFileSync"](${JSON.stringify(marker)},"rce")), yy`
  try {
    for (const fields of [{ [payload]: 1 }, { crt: { [payload]: 1 } }]) {
      const r = await post('/api/save-identity', { stationId: 'distortion-field', fields })
      assert.equal(r.status, 409, r.text)
      await new Promise((res) => setTimeout(res, 200))
      assert.equal(existsSync(marker), false, `code in a key ran in the server: ${JSON.stringify(Object.keys(fields))}`)
    }
    assert.equal(git('status', '--porcelain', 'stations.js'), '', 'stations.js untouched')
  } finally { restore() }
})

test('a malformed Host header gets an answer, not a crash (S-M1)', async () => {
  for (const host of ['127.0.0.1:x', '127.0.0.1:99999', '[', 'a b']) {
    // Any answer at all is the point: these used to kill the process.
    // (127.0.0.1:x is answered normally -- its host part is allowed.)
    const r = await request({ path: '/', headers: { Host: host } })
    assert.ok(r.status >= 200, `${host} -> ${r.status}`)
  }
  const alive = await request({ path: '/api/git', headers: ADMIN })
  assert.equal(alive.status, 200, 'the server is still up')
})

test('rejecting keeps station-profiles.json in its own indent, and __proto__ is no station (C-M1, S-L2)', async () => {
  try {
    const r = await post('/api/reject', { stationId: 'cold-wave', youtubeId: 'AAAAAAAAAAA', title: 't', artist: 'a', reason: 'test' })
    assert.equal(r.status, 200, r.text)
    const changed = git('diff', '--numstat', '--', 'tools/station-profiles.json').split(/\s+/).map(Number)
    assert.ok(changed[0] < 15 && changed[1] < 5, `one rejection rewrote ${changed[0]}+/${changed[1]}- lines`)
    const p = await post('/api/reject', { stationId: '__proto__', youtubeId: 'BBBBBBBBBBB', reason: 'x' })
    assert.equal(p.json.profile, 'no-profile', 'Object.prototype is not a station profile')
  } finally { restore() }
})

test('a pending-tracks.json that does not parse is refused, not replaced (C-H2)', async () => {
  try {
    const broken = '<<<<<<< HEAD\n' + read('tools/pending-tracks.json')
    writeFileSync(path.join(root, 'tools/pending-tracks.json'), broken)
    const r = await post('/api/reject', { stationId: 'cold-wave', youtubeId: 'CCCCCCCCCCC', reason: 'x' })
    assert.equal(r.status, 400)
    assert.match(r.json.error, /not valid JSON/)
    assert.equal(read('tools/pending-tracks.json'), broken, 'the file was left exactly as it was')
  } finally { restore() }
})

test('a save from a page that loaded an older file is refused (C-M2)', async () => {
  try {
    const state = (await request({ path: '/api/state', headers: ADMIN })).json
    const st = state.roster.stations.find((s) => s.id === 'cipher')
    const tracks = st.tracks.map(({ youtubeId, title, artist }) => ({ youtubeId, title, artist }))
    // A hand edit lands after the page loaded...
    writeFileSync(path.join(root, 'stations.js'), read('stations.js') + '\n// hand edit\n')
    const r = await post('/api/save-tracks', { stationId: 'cipher', tracks, baseHash: state.hashes.stations })
    assert.equal(r.status, 409)
    assert.equal(r.json.stale, true)
    assert.ok(read('stations.js').endsWith('// hand edit\n'), 'the hand edit survived')
    const q = await post('/api/pending', { pending: [], rejected: [], baseHash: 'not-the-hash' })
    assert.equal(q.json.stale, true, 'the queue save is checked the same way')
    // ...and a save that carries the CURRENT hash goes through.
    const fresh = (await request({ path: '/api/source', headers: ADMIN })).json.hash
    const ok = await post('/api/save-tracks', { stationId: 'cipher', tracks, baseHash: fresh })
    assert.equal(ok.status, 200, ok.text)
  } finally { restore() }
})

test('a write waits for nothing: it is refused while another writer holds the lock, and a closed tab releases it (C-M4)', async () => {
  // A long task, abandoned mid-run: the dead-feedback sweep takes ~1min. (Not
  // 'test' -- in this copy the suite includes this file, which would recurse.)
  const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/run', headers: { ...ADMIN, 'Content-Type': 'application/json' } })
  req.on('error', () => {})
  req.end(JSON.stringify({ task: 'deadfeedback' }))
  await new Promise((r) => setTimeout(r, 500))
  const busy = await post('/api/save-identity', { stationId: 'cipher', fields: { tagline: 'x' } })
  assert.equal(busy.status, 409)
  assert.match(busy.json.error, /busy/)
  // 2026-11-02 (control room) -- the ON AIR lamp reads the same lock, and
  // names the holder the 409 named.
  const air = await request({ path: '/api/on-air' })
  assert.equal(air.json?.onAir, true, air.text)
  assert.equal(air.json.busy, 'task "deadfeedback"')
  req.destroy()   // the tab closes
  let freed = false
  for (let i = 0; i < 40 && !freed; i++) {
    await new Promise((r) => setTimeout(r, 250))
    freed = (await post('/api/pending', { pending: [], rejected: [] })).json?.busy === undefined
  }
  assert.ok(freed, 'the lock was released once the requester went away')
  assert.equal((await request({ path: '/api/on-air' })).json?.busy, null, 'and the lamp went dark with it')
  restore()
})

test('SHIP refuses, before stamping, on a clean tree, off main, and behind the remote (C-M3)', async () => {
  const stamp = read('build.json')
  const ship = async () => {
    const r = await post('/api/ship', { message: 'x', confirm: true })
    return r.text + JSON.stringify(r.json || {}) + r.status
  }
  try {
    assert.match(await ship(), /nothing to ship/)
    writeFileSync(path.join(root, 'README.md'), read('README.md') + '\nedit\n')
    // Behind: someone else pushed to the remote.
    const other = path.join(tmp, 'other')
    sh(tmp, 'git', ['clone', '-q', path.join(tmp, 'remote.git'), 'other'])
    sh(other, 'git', ['-c', 'user.email=o@o', '-c', 'user.name=o', 'commit', '-q', '--allow-empty', '-m', 'moved'])
    sh(other, 'git', ['push', '-q'])
    assert.match(await ship(), /ahead of you/)
    git('checkout', '-qb', 'side')
    assert.match(await ship(), /not main/)
    assert.equal(read('build.json'), stamp, 'no refusal bumped the stamp')
    assert.equal(git('log', '-1', '--format=%s'), 'base', 'nothing was committed')
  } finally {
    git('checkout', '-q', 'main'); spawnSync('git', ['branch', '-qD', 'side'], { cwd: root }); restore()
  }
})

// 2026-11-02 -- a SHIP that fails AFTER stamping puts the stamp back. It
// said it did ("build stamp restored") and did not: build.json was missing
// from WRITABLE, so restoreStamp()'s write threw into its own try/catch.
// Mutation-checked: removing 'build.json' from WRITABLE fails this.
test('a SHIP that fails after the stamp restores build.json, and commits nothing', async () => {
  // The refusal test above leaves this copy BEHIND the remote, and a later
  // test relies on that; catch up for this one, and put HEAD back after.
  const head = git('rev-parse', 'HEAD')
  git('fetch', '-q'); git('merge', '-q', '--ff-only', 'origin/main')
  const subject = git('log', '-1', '--format=%s')
  const stamp = read('build.json')
  try {
    const src = read('stations.js')
    const m = src.match(/tagline: '([^']*)'/)
    writeFileSync(path.join(root, 'stations.js'), src.replace(m[0], `tagline: '${m[1]} -- padded well past the guide index LANE column'`))
    const r = await post('/api/ship', { message: 'lint refuses this', confirm: true })
    assert.match(r.text, /"failed":"lint"/, r.text.slice(-400))
    assert.match(r.text, /bumping build stamp/, 'it got as far as stamping')
    assert.equal(read('build.json'), stamp, 'the stamp was put back')
    assert.equal(git('log', '-1', '--format=%s'), subject, 'nothing was committed')
  } finally { restore(); git('reset', '-q', '--hard', head) }
})

// 2026-11-01 -- a track save regenerates README's roster counts along with
// stations.md, so a dashboard approve/remove no longer leaves SHIP stopped at
// lint over a number nobody typed. Asserted the strong way: the copy's own
// lint passes after the save, and README's diff is exactly the two lines that
// carry a track total (the tracks badge and the sentence).
test('a track save rewrites README\'s roster counts, and nothing else in README', async () => {
  try {
    const state = (await request({ path: '/api/state', headers: ADMIN })).json
    const st = state.roster.stations.find((s) => s.id === 'cipher')
    const tracks = st.tracks.slice(0, -1).map(({ youtubeId, title, artist }) => ({ youtubeId, title, artist }))
    const total = state.roster.stations.filter((s) => !s.secret).reduce((n, s) => n + s.tracks.length, 0)
    assert.ok(read('README.md').includes(`badge/tracks-${total}-`), 'README agreed with the roster before the save')
    const r = await post('/api/save-tracks', { stationId: 'cipher', tracks, baseHash: state.hashes.stations })
    assert.equal(r.status, 200, r.text)
    const readme = read('README.md')
    assert.ok(readme.includes(`[![tracks: ${total - 1}](https://img.shields.io/badge/tracks-${total - 1}-`), 'both copies of the tracks badge')
    assert.match(readme, new RegExp(`, ${total - 1} tracks total \\(`), 'the roster sentence')
    assert.equal(git('diff', '--numstat', '--', 'README.md'), '2\t2\tREADME.md')
    const lint = spawnSync(process.execPath, ['tools/lint-roster.js'], { cwd: root, encoding: 'utf8' })
    assert.equal(lint.status, 0, lint.stdout + lint.stderr)
  } finally { restore() }
})

test('a save whose README counts cannot be found is refused whole: stations.js untouched', async () => {
  try {
    writeFileSync(path.join(root, 'README.md'), read('README.md').replace('tracks total', 'songs total'))
    git('commit', '-qam', 'reword')
    const before = read('stations.js')
    const fresh = (await request({ path: '/api/source', headers: ADMIN })).json.hash
    const state = (await request({ path: '/api/state', headers: ADMIN })).json
    const st = state.roster.stations.find((s) => s.id === 'cipher')
    const tracks = st.tracks.slice(0, -1).map(({ youtubeId, title, artist }) => ({ youtubeId, title, artist }))
    const r = await post('/api/save-tracks', { stationId: 'cipher', tracks, baseHash: fresh })
    assert.equal(r.status, 409, r.text)
    assert.match(r.json.error, /roster sentence/)
    assert.equal(read('stations.js'), before, 'stations.js was not written')
    assert.equal(git('status', '--porcelain'), '', 'nothing was written')
  } finally { git('reset', '-q', '--hard', 'HEAD~1'); restore() }
})

test('a repoint save (`replaces`) keeps the old entry\'s comment block on the new id (dashboard UI)', async () => {
  try {
    const state = (await request({ path: '/api/state', headers: ADMIN })).json
    const st = state.roster.stations.find((s) => s.id === 'city-lights')
    const tracks = st.tracks.map(({ youtubeId, title, artist }) => ({ youtubeId, title, artist }))
    const i = tracks.findIndex((t) => t.youtubeId === 'be5AvQFzsu0')
    tracks[i] = { ...tracks[i], youtubeId: 'ZZZZZZZZZZZ', replaces: 'be5AvQFzsu0' }
    const before = read('stations.js')
    const r = await post('/api/save-tracks', { stationId: 'city-lights', tracks, baseHash: state.hashes.stations })
    assert.equal(r.status, 200, r.text)
    assert.deepEqual(r.json.droppedComments, [])
    assert.equal(read('stations.js'), before.replace("realTrack('be5AvQFzsu0',", "realTrack('ZZZZZZZZZZZ',"))
  } finally { restore() }
})

// 2026-11-01 (audit L8) -- a ship-check's fetch and SHIP's own preflight
// fetch must never overlap: two fetches in one repo can fail on "cannot lock
// ref", and SHIP then refuses spuriously. The remote's upload-pack is
// wrapped to log when each fetch starts and ends and to take a second about
// it, so an overlap is a fact in the log rather than a lucky collision.
// SHIP is made to stop right after its fetch by putting the remote ahead.
test('SHIP waits out an in-flight ship-check fetch rather than fetching beside it (L8)', async () => {
  const log = path.join(tmp, 'fetches.log')
  const wrapper = path.join(tmp, 'slow-upload-pack.sh')
  writeFileSync(wrapper, `#!/bin/sh\necho "start $$" >> '${log}'\nsleep 1\necho "end $$" >> '${log}'\nexec git-upload-pack "$@"\n`, { mode: 0o755 })
  const other = path.join(tmp, 'other-l8')
  try {
    git('fetch', '-q'); git('merge', '-q', '--ff-only', 'origin/main')
    sh(tmp, 'git', ['clone', '-q', path.join(tmp, 'remote.git'), 'other-l8'])
    sh(other, 'git', ['-c', 'user.email=o@o', '-c', 'user.name=o', 'commit', '-q', '--allow-empty', '-m', 'moved'])
    sh(other, 'git', ['push', '-q'])
    writeFileSync(path.join(root, 'README.md'), read('README.md') + '\nedit\n')
    git('config', 'remote.origin.uploadpack', wrapper)
    const check = request({ path: '/api/ship-check', headers: ADMIN })
    await new Promise((r) => setTimeout(r, 300))           // the check's fetch is under way
    const ship = post('/api/ship', { message: 'x', confirm: true })
    const [c, s] = await Promise.all([check, ship])
    assert.ok(c.json.blockers.some((b) => /ahead of you/.test(b)), c.text)
    assert.match(s.text, /ahead of you/, 'SHIP fetched, and refused on what it found -- not on a fetch error')
    const lines = readFileSync(log, 'utf8').trim().split('\n').map((l) => l.split(' ')[0])
    assert.deepEqual(lines, ['start', 'end', 'start', 'end'], `fetches overlapped:\n${readFileSync(log, 'utf8')}`)
  } finally {
    try { git('config', '--unset', 'remote.origin.uploadpack') } catch (e) {}
    rmSync(log, { force: true })
    restore()
  }
})

test('GET /api/ship-check answers with the same blockers SHIP would refuse on (dashboard UI)', async () => {
  // The SHIP test above leaves the remote a commit ahead; catch up first.
  git('fetch', '-q'); git('merge', '-q', '--ff-only', 'origin/main')
  const clean = (await request({ path: '/api/ship-check', headers: ADMIN })).json
  assert.ok(clean.blockers.some((b) => /nothing to ship/.test(b)), JSON.stringify(clean))
  try {
    writeFileSync(path.join(root, 'README.md'), read('README.md') + '\nedit\n')
    const ready = (await request({ path: '/api/ship-check', headers: ADMIN })).json
    assert.deepEqual(ready.blockers, [], JSON.stringify(ready))
    assert.equal(ready.behind, 0)
  } finally { restore() }
})
