// tools/admin-server.mjs -- the security guards, pinned (2026-09-02 audit, T2).
//
// This is the one process in the repo that can run `git push`, and until
// this file its three guards -- the Host allowlist, the X-Signal-Admin
// header on every mutating route, and 404-outside-repo static serving --
// were enforced by prose in CLAUDE.md and nothing else. A fourth joined
// them 2026-09-02: the static ALLOWLIST (S1), which is the only one of the
// four that was ever actually exploited rather than merely reachable. These tests spawn
// the real server on a loopback ephemeral port and make real HTTP requests,
// because the guards live in the request path and a unit-level import
// cannot see them.
//
// Deliberately NOT here: the SHIP pipeline's stop-on-first-failure ordering.
// Exercising it honestly needs a scratch git repo with a remote, and a
// dishonest version (mocking the runner) would be the decorative-test shape
// this suite keeps having to unlearn. If SHIP grows a bug, that is the test
// to write, against a temp repo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SERVER = path.join(here, '..', 'tools', 'admin-server.mjs')

/** Spawn the real server on a random loopback port; resolve once its banner
 *  says it is listening. */
function startServer() {
  const port = 20000 + Math.floor(Math.random() * 20000)
  // The unit tests further down import the module with SIGNAL_ADMIN_IMPORT
  // set; the spawned server must not inherit it or it never listens.
  const child = spawn(process.execPath, [SERVER, String(port)], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SIGNAL_ADMIN_IMPORT: '' } })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('admin-server did not come up in 5s')) }, 5000)
    let out = ''
    child.stdout.on('data', (d) => {
      out += d
      if (out.includes('SIGNAL admin')) { clearTimeout(timer); resolve({ child, port }) }
    })
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`admin-server exited ${code} before listening:\n${out}`)) })
  })
}

/** One request through node:http (fetch refuses to send a forged Host). */
function request(port, { method = 'GET', path: p = '/', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      let body = ''
      res.on('data', (d) => { body += d })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

// The allowlist, asserted from both ends, against BOTH servers. Every path
// here goes through HTTP, so a refused path and a missing path both read as
// 404 -- which is why the dot rule has its own unit test further down.
const DENIED = [
  '/.elevenlabs-key',        // the finding itself
  '/.elevenlabs-voice-id',   // its neighbour
  '/.git/config',            // history, not the working tree
  '/.gitignore',             // a dotfile with no extension (the EXTENSION gate refuses this one -- see the servable() unit test for the dot rule proper)
  '/tools/station-profiles.json', // curation records, not app assets
  '/tools/pending-tracks.json',
  '/tools/admin-server.mjs', // this server's own source
  '/tests/harness.mjs',      // a whole tree with no business being served
  '/LICENSE',                 // no extension at all
  // 2026-09-12 (audit, L8) -- ENCODED traversal. `/../x` is normalised away
  // by URL parsing before servable() ever sees it, so the old single probe
  // exercised nothing; `%2F..%2F` and `%2e%2e` survive parsing and are
  // decoded by the server itself, which is where the guard has to hold.
  '/audio%2F..%2Ftools%2Fstation-profiles.json',
  '/audio/%2e%2e/tools/station-profiles.json',
  '/%2e%2e/%2e%2e/etc/hostname',
  // 2026-09-12 (audit, L6) -- bare directories: no listings, on either server.
  '/audio', '/audio/', '/tools', '/tools/', '/src/',
]
// ...and everything the app and the dashboard actually fetch still is.
// /tools/lib/roster.mjs is the sharp one: network.html imports it, so an
// over-tight allowlist takes the dashboard down with the secret.
const ALLOWED = [
  '/index.html', '/main.js', '/program.js', '/stations.js', '/build.json',
  '/src/crt.js', '/ui/desktop.js', '/visuals/index.js',
  '/fonts/ter-u16n.bdf', '/screenshots/hero.jpg',
  '/tools/network.html',   // the dashboard
  '/tools/lib/roster.mjs', // which imports this
  // 2026-09-21 -- the install manifest and what it names. A manifest that
  // 404s fails silently: the page still works, it just cannot be installed.
  '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
]
async function staticAllowlistHolds(port, label) {
  for (const denied of DENIED) {
    const r = await request(port, { path: denied, headers: { Host: '127.0.0.1' } })
    assert.equal(r.status, 404, `${label}: ${denied} must not be served, got ${r.status}`)
  }
  for (const allowed of ALLOWED) {
    const r = await request(port, { path: allowed, headers: { Host: '127.0.0.1' } })
    assert.equal(r.status, 200, `${label}: ${allowed} must still be served, got ${r.status}`)
  }
}

test('admin-server: the four request-path guards hold', async () => {
  const { child, port } = await startServer()
  try {
    // Sanity: a legitimate loopback request works.
    const ok = await request(port, { path: '/api/git' })
    assert.equal(ok.status, 200, 'a plain loopback GET should be answered')

    // Host allowlist -- the DNS-rebinding defence. A browser lured to
    // evil.com resolving to 127.0.0.1 sends `Host: evil.com`, and the
    // server must refuse it however the name resolved.
    const rebind = await request(port, { path: '/admin', headers: { Host: 'evil.com' } })
    assert.equal(rebind.status, 403, 'a foreign Host header must be refused')
    assert.ok(rebind.body.includes('does not answer'), 'and say why')

    // X-Signal-Admin -- the CSRF guard on every mutating route. A
    // cross-origin page cannot send this header without a CORS preflight
    // this server never answers, so its absence must refuse BEFORE any
    // route logic runs. /api/reject is the sharpest route to point this
    // at: with the header it writes two files.
    const csrf = await request(port, { method: 'POST', path: '/api/reject', headers: { Host: '127.0.0.1' } })
    assert.equal(csrf.status, 403, 'a mutating route without the header must be refused')
    assert.ok(csrf.body.includes('X-Signal-Admin'), 'and name the missing header')

    // Static serving stays inside the repo. Path traversal out of ROOT is
    // a 404, not a file.
    const traverse = await request(port, { path: '/../../../etc/hostname', headers: { Host: '127.0.0.1' } })
    assert.notEqual(traverse.status, 200, 'a path outside the repo must not serve')

    // 2026-09-02 (audit, L7) -- an ABSENT Host header must be refused too.
    // node:http always sends one, so this goes through a raw socket the way
    // an HTTP/1.0 client would; the old `host && ...` guard let it pass.
    const noHost = await new Promise((resolve, reject) => {
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.write('GET /api/git HTTP/1.0\r\n\r\n')
      })
      let buf = ''
      sock.on('data', (d) => { buf += d })
      sock.on('end', () => resolve(buf))
      sock.on('error', reject)
    })
    assert.match(noHost, /^HTTP\/1\.[01] 403/, `a request with no Host header got: ${noHost.slice(0, 40)}`)

    // 2026-09-02 (audit, S1) -- the static ALLOWLIST. The repo root is a
    // working directory, and this server was handing `.elevenlabs-key` to
    // any tailnet peer that asked (confirmed live at 200). Asserted from
    // both ends, because an allowlist that serves nothing would pass the
    // refusal half alone and break the app in a way no other test here
    // would notice. The lists are shared with the dev-server test below.
    await staticAllowlistHolds(port, 'admin-server')

    // 2026-09-02 (audit, L11) -- the boot payload's station cap is per-band
    // and imported from lint-roster.js, not restated flat.
    const state = await request(port, { path: '/api/state' })
    assert.equal(state.status, 200)
    const limits = JSON.parse(state.body).limits
    assert.equal(limits.MAX_PUBLIC_STATIONS_PER_BAND, 9, 'per-band cap missing from the boot payload')
    assert.equal(limits.MAX_PUBLIC_STATIONS, undefined, 'the retired flat cap is still being sent')
  } finally {
    child.kill()
  }
})

test('admin-server: a bare --host= refuses to start rather than binding everything', async () => {
  // 2026-09-02 (audit, L8) -- `--host=` parsed as '' and listen(PORT, '')
  // binds every interface, on the process that can `git push`. Typo-shaped,
  // so the guard is at startup: error out, never bind.
  const child = spawn(process.execPath, [SERVER, '--host=', '29999'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SIGNAL_ADMIN_IMPORT: '' } })
  const { code, err } = await new Promise((resolve) => {
    let err = ''
    child.stderr.on('data', (d) => { err += d })
    const timer = setTimeout(() => { child.kill(); resolve({ code: 'timeout', err }) }, 5000)
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, err }) })
  })
  assert.equal(code, 1, `expected exit 1, got ${code}`)
  assert.ok(err.includes('--host='), 'and an error naming the flag')
})

// 2026-09-12 (audit, M15) -- the dot rule as a FUNCTION. Mutating
// `seg.startsWith('.')` to `false` in servable() left the HTTP test above
// green: every dot-path it probes is refused by a different gate (the
// extension gate for `/.gitignore`, STATIC_DIRS for `/.git/config`), and
// what the rule actually protects -- a secret inside a served directory --
// cannot be probed over HTTP without planting one. So it is imported and
// asked directly. SIGNAL_ADMIN_IMPORT keeps the import from binding a port.
process.env.SIGNAL_ADMIN_IMPORT = '1'
const admin = await import('../tools/admin-server.mjs')

test('servable(): the dot rule refuses a dot-segment inside an allowed directory', () => {
  for (const rel of ['audio/.hidden.mp3', 'audio/.render-x.mp3', 'tools/.x.html', 'tools/lib/.roster.mjs', 'src/.env', 'ui/.DS_Store']) {
    assert.equal(admin.servable(rel), false, `${rel} must be refused by the dot rule`)
  }
  // ...and the same shapes without the dot are exactly what is served, so
  // the refusal above is the dot and nothing else.
  for (const rel of ['audio/hidden.mp3', 'tools/x.html', 'tools/lib/roster.mjs', 'src/crt.js']) {
    assert.equal(admin.servable(rel), true, `${rel} must be served`)
  }
})

test('renameWarnings(): the clip check asks the real clip map', async () => {
  // 2026-09-13 (audit, M4) -- the check regexed audio/voice.js for a map that
  // had moved to audio/station-id-clips.js, matched nothing, and fell back to
  // the station id: SYNAPSE (id 'midnight-neon') was checked against the
  // retired station-id-midnight-neon.mp3 and flagged as announcing the wrong
  // name. The app plays station-id-synapse.mp3.
  const synapse = await admin.renameWarnings({ id: 'midnight-neon', callsign: 'SYNAPSE' })
  assert.deepEqual(synapse.filter((w) => w.kind === 'audio'), [], 'SYNAPSE plays its own clip -- no audio warning')

  // ...and the check still fires where it should: a renamed station whose
  // clip is filed under its id still says the old name.
  const renamed = (await admin.renameWarnings({ id: 'cipher', callsign: 'NOT CIPHER' })).filter((w) => w.kind === 'audio')
  assert.equal(renamed.length, 1, 'a callsign that no longer matches the clip is warned about')
  assert.equal(renamed[0].file, 'audio/station-id-cipher.mp3')
  assert.match(renamed[0].detail, /station-id-clips\.js/, 'the advice names the file that holds the map')
})

test('the write-temp file is dot-prefixed, unservable and gitignored', () => {
  // 2026-09-12 (audit, M9) -- SHIP stages with `add -A`, so a crash between
  // the temp write and the rename used to leave `stations.js.tmp-<pid>` at
  // the repo root for the next SHIP to push. Both halves: the name keeps it
  // off HTTP (dot rule), .gitignore keeps it out of the commit.
  const tmp = admin.tmpPathFor(path.join(here, '..', 'stations.js'))
  assert.ok(path.basename(tmp).startsWith('.'), `temp name ${path.basename(tmp)} must be dot-prefixed`)
  assert.equal(admin.servable(path.relative(path.join(here, '..'), tmp)), false)
  for (const name of [path.basename(tmp), 'stations.js.tmp-1234', 'tools/station-profiles.json.tmp-9']) {
    const r = spawnSync('git', ['check-ignore', '-q', name], { cwd: path.join(here, '..') })
    assert.equal(r.status, 0, `${name} must be gitignored`)
  }
})

test('the dashboard shoots THIS server, not the deployed site', () => {
  // 2026-09-12 (audit, M10) -- shoot.mjs defaults to the Pages URL, so the
  // "regenerate screenshots" button captured the PREVIOUS deploy and SHIP
  // committed the stale shots as fresh.
  const [cmd, args] = admin.TASKS.shoot.cmd()
  assert.equal(cmd, 'node')
  const url = args.find((a) => a.startsWith('--url='))
  assert.ok(url, 'shoot must be given a --url')
  assert.match(url, /^--url=http:\/\/(127\.0\.0\.1|\[[0-9a-f:]+\]|[0-9.]+):\d+\/$/, url)
  assert.ok(!url.includes('github.io'), 'never production')
})

// 2026-09-12 (audit, M15) -- tools/dev-server.py carries a deliberate copy
// of the allowlist, "kept identical" by eye, and had no test at all -- on
// the server that binds every interface. Same lists, same assertions.
// Skipped with a diagnostic rather than failed when python3 is absent: the
// JS half above is the one the app depends on.
test('dev-server.py: the same allowlist holds', async (t) => {
  const py = spawnSync('python3', ['--version'])
  if (py.status !== 0) { t.diagnostic('python3 not found; dev-server.py allowlist not checked'); return }
  const port = 20000 + Math.floor(Math.random() * 20000)
  const child = spawn('python3', ['-u', path.join(here, '..', 'tools', 'dev-server.py'), String(port)], {
    cwd: path.join(here, '..'), stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('dev-server.py did not come up in 5s')), 5000)
      let out = ''
      child.stdout.on('data', (d) => { out += d; if (out.includes('Serving')) { clearTimeout(timer); resolve() } })
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`dev-server.py exited ${code} before listening`)) })
    })
    await staticAllowlistHolds(port, 'dev-server.py')
  } finally {
    child.kill()
  }
})
