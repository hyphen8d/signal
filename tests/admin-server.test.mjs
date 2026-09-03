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
import { spawn } from 'node:child_process'
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
  const child = spawn(process.execPath, [SERVER, String(port)], { stdio: ['ignore', 'pipe', 'pipe'] })
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
    // would notice.
    for (const denied of [
      '/.elevenlabs-key',        // the finding itself
      '/.elevenlabs-voice-id',   // its neighbour
      '/.git/config',            // history, not the working tree
      '/.gitignore',             // the dot rule, generally
      '/tools/station-profiles.json', // curation records, not app assets
      '/tools/pending-tracks.json',
      '/tools/admin-server.mjs', // this server's own source
      '/tests/harness.mjs',      // a whole tree with no business being served
      '/LICENSE',                 // no extension at all
    ]) {
      const r = await request(port, { path: denied, headers: { Host: '127.0.0.1' } })
      assert.equal(r.status, 404, `${denied} must not be served, got ${r.status}`)
    }
    // ...and everything the app and the dashboard actually fetch still is.
    // /tools/lib/roster.mjs is the sharp one: network.html imports it, so an
    // over-tight allowlist takes the dashboard down with the secret.
    for (const allowed of [
      '/index.html', '/main.js', '/program.js', '/stations.js', '/build.json',
      '/src/crt.js', '/ui/desktop.js', '/visuals/index.js',
      '/fonts/ter-u16n.bdf', '/screenshots/hero.jpg',
      '/tools/network.html',   // the dashboard
      '/tools/lib/roster.mjs', // which imports this
    ]) {
      const r = await request(port, { path: allowed, headers: { Host: '127.0.0.1' } })
      assert.equal(r.status, 200, `${allowed} must still be served, got ${r.status}`)
    }

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
  const child = spawn(process.execPath, [SERVER, '--host=', '29999'], { stdio: ['ignore', 'pipe', 'pipe'] })
  const { code, err } = await new Promise((resolve) => {
    let err = ''
    child.stderr.on('data', (d) => { err += d })
    const timer = setTimeout(() => { child.kill(); resolve({ code: 'timeout', err }) }, 5000)
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, err }) })
  })
  assert.equal(code, 1, `expected exit 1, got ${code}`)
  assert.ok(err.includes('--host='), 'and an error naming the flag')
})
