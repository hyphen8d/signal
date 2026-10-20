// tools/lib/capture.mjs (the one-capture-at-a-time lock and the leftover-
// Chrome reaper) and the viz-preview PNG path, tested without a Chrome.
// Written 2026-10-20 after the 2026-10-18 pile-up -- see capture.mjs's
// header. The decisions are pure functions over injected inputs (who is
// alive, which processes exist, what is in a dir), so each rule is asserted
// from both sides: what gets reaped AND what must never be (the user's own
// Chrome, a tool still running from an older checkout).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  acquireLock, chromePidsFor, isAlive, makeRunDir, normArgs, planReap, procStart, runOwner,
} from '../tools/lib/capture.mjs'
import { crc32, encodePNG } from '../tools/lib/png.mjs'
import { previewEffect, sheet, tintFramebuffer } from '../tools/viz-preview.mjs'

const scratch = () => mkdtempSync(path.join(tmpdir(), 'signal-capture-test-'))
const quiet = () => {}

test('isAlive: this process yes, a dead pid no, a reused pid (start time mismatch) no', () => {
  assert.equal(isAlive(process.pid, procStart(process.pid)), true)
  assert.equal(isAlive(2 ** 22 + 12345), false)
  assert.equal(isAlive(process.pid, 'not-my-start-time'), false)
})

test('lock: acquire, refuse a second holder until released, then hand over', async () => {
  const dir = scratch()
  try {
    const file = path.join(dir, 'capture.lock')
    const release = await acquireLock({ file, reentrant: false, log: quiet })
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).pid, process.pid)
    // A second taker (pretending to be another live process) waits...
    const said = []
    let got = false
    const other = acquireLock({ file, reentrant: false, poll: 20, log: (m) => said.push(m), self: { pid: process.pid + 1, start: 'x' } })
      .then((r) => { got = true; return r })
    await new Promise((r) => setTimeout(r, 120))
    assert.equal(got, false, 'took a lock that was held')
    assert.match(said.join('\n'), new RegExp(`waiting for pid ${process.pid}`), 'a waiter says whom it waits on')
    release()
    const r2 = await other
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).pid, process.pid + 1)
    r2()
    assert.equal(existsSync(file), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('lock: a dead holder is stale and broken; a live one times out rather than being stolen', async () => {
  const dir = scratch()
  try {
    const file = path.join(dir, 'capture.lock')
    writeFileSync(file, JSON.stringify({ pid: 2 ** 22 + 4242, start: '1', tool: 'viz-sheet.mjs' }))
    const said = []
    const release = await acquireLock({ file, reentrant: false, poll: 10, timeoutMs: 2000, log: (m) => said.push(m) })
    assert.match(said.join('\n'), /is dead -- breaking the stale lock/)
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).pid, process.pid)
    release()
    // A holder reported alive is never broken.
    writeFileSync(file, JSON.stringify({ pid: 4242, start: '1' }))
    await assert.rejects(
      acquireLock({ file, reentrant: false, poll: 10, timeoutMs: 60, log: quiet, alive: () => true }),
      /still held by pid 4242/)
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).pid, 4242)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('normArgs: Chrome joins its argv into one string; split it back at each --flag', () => {
  const joined = ['/opt/google/chrome/chrome --headless=new --user-data-dir=/tmp/signal-shoot-AbC123 --type=renderer --database=/home/u/.config/google-chrome/Crash Reports --x=1 http://127.0.0.1:8000/']
  const a = normArgs(joined)
  assert.ok(a.includes('--user-data-dir=/tmp/signal-shoot-AbC123'))
  assert.ok(a.includes('--database=/home/u/.config/google-chrome/Crash Reports'), 'a value with a space stays whole')
  assert.deepEqual(normArgs(['node', 'tools/shoot.mjs']), ['node', 'tools/shoot.mjs'])
})

test('reap: only our Chromes and their crashpad, only when the owner is dead -- never the user\'s Chrome', () => {
  const runs = '/c/runs'
  const live = `${runs}/viz-sheet-100-5-aaaaaa`, dead = `${runs}/shoot-200-6-bbbbbb`
  const owners = { [live]: { pid: 100, start: '5' }, [dead]: { pid: 200, start: '6' } }
  const readdir = (d) => (d === runs ? [path.basename(live), path.basename(dead)] : d === '/tmp'
    ? ['signal-shoot-Old111', 'signal-shoot-New222', 'signal-viz-Tiles3', 'signal-viz-sheet', 'signal-health-xyz123', 'other'] : [])
  const now = 10_000_000
  const ages = { '/tmp/signal-shoot-Old111': 600_000, '/tmp/signal-shoot-New222': 10_000 }
  const stat = (p) => ({ isDirectory: () => true, mtimeMs: now - (ages[p] ?? 7200_000) })
  const procs = [
    { pid: 1, ppid: 0, args: ['/sbin/init'] },
    { pid: 50, ppid: 1, args: ['/usr/bin/node', 'tools/viz-sheet.mjs'] },
    // ours, dead owner: main + renderer + its crashpad
    { pid: 300, ppid: 1, args: ['/opt/google/chrome/chrome', '--headless=new', `--user-data-dir=${dead}/profile`, '--crashpad-handler-pid=301'] },
    { pid: 302, ppid: 300, args: ['/opt/google/chrome/chrome', '--type=renderer', `--user-data-dir=${dead}/profile`] },
    { pid: 301, ppid: 1, args: ['/opt/google/chrome/chrome_crashpad_handler', '--database=/home/u/.config/google-chrome/Crash Reports'] },
    // ours, live owner
    { pid: 400, ppid: 100, args: ['/opt/google/chrome/chrome', `--user-data-dir=${live}/profile`] },
    // legacy orphan (parent is init) and legacy still owned by an old node tool
    { pid: 500, ppid: 1, args: ['/opt/google/chrome/chrome', '--headless=new', '--user-data-dir=/home/u/jobs/tmp/signal-shoot-Orph11', '--crashpad-handler-pid=501'] },
    { pid: 502, ppid: 500, args: ['/opt/google/chrome/chrome', '--type=gpu-process', '--user-data-dir=/home/u/jobs/tmp/signal-shoot-Orph11'] },
    { pid: 600, ppid: 50, args: ['/opt/google/chrome/chrome', '--headless=new', '--user-data-dir=/tmp/signal-shoot-Busy11'] },
    // the user's own Chrome and its crashpad: no profile of ours anywhere
    { pid: 700, ppid: 1, args: ['/opt/google/chrome/chrome', '--ozone-platform=wayland', '--crashpad-handler-pid=701'] },
    { pid: 701, ppid: 1, args: ['/opt/google/chrome/chrome_crashpad_handler', '--database=/home/u/.config/google-chrome/Crash Reports'] },
  ]
  const plan = planReap({
    runs, legacyRoots: ['/tmp'], procs, now, readdir, stat,
    alive: (pid) => pid === 100 || pid === 50,
  })
  // runOwner reads owner.json, absent here, so it falls back to the name.
  assert.deepEqual(runOwner(dead), { pid: owners[dead].pid, start: owners[dead].start })
  assert.deepEqual(plan.kill.sort((a, b) => a - b), [300, 301, 302, 500, 501, 502])
  for (const pid of [1, 50, 400, 600, 700, 701]) assert.ok(!plan.kill.includes(pid), `must not kill ${pid}`)
  assert.ok(plan.remove.includes(dead) && !plan.remove.includes(live))
  assert.ok(plan.remove.includes('/home/u/jobs/tmp/signal-shoot-Orph11'), 'an orphan\'s profile goes with it')
  assert.ok(plan.remove.includes('/tmp/signal-shoot-Old111'), 'an unused legacy profile older than 2 min')
  assert.ok(!plan.remove.includes('/tmp/signal-shoot-New222'), 'a just-made profile may be about to be used')
  assert.ok(plan.remove.includes('/tmp/signal-viz-Tiles3'), 'legacy scratch older than the hour')
  for (const keep of ['/tmp/signal-viz-sheet', '/tmp/signal-health-xyz123', '/tmp/other']) assert.ok(!plan.remove.includes(keep), keep)
})

test('chromePidsFor only follows crashpad links from processes using our profile', () => {
  const procs = [
    { pid: 10, ppid: 1, args: ['chrome', '--user-data-dir=/x/p', '--crashpad-handler-pid=11'] },
    { pid: 20, ppid: 1, args: ['chrome', '--crashpad-handler-pid=21'] },
  ]
  assert.deepEqual(chromePidsFor(procs, (d) => d === '/x/p').sort(), [10, 11])
})

test('makeRunDir writes its owner and removes itself', () => {
  const dir = scratch()
  try {
    const run = makeRunDir('test', { root: dir })
    assert.ok(existsSync(run.work))
    assert.equal(runOwner(run.dir).pid, process.pid)
    run.remove()
    assert.equal(existsSync(run.dir), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

/** Parse a PNG enough to check it: signature, every chunk's CRC, IHDR, and
 *  that IDAT inflates to exactly one filter byte + width*3 bytes per row. */
function readPNG(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  let o = 8, ihdr = null
  const idat = []
  const types = []
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8)
    const data = buf.subarray(o + 8, o + 8 + len)
    assert.equal(buf.readUInt32BE(o + 8 + len), crc32(buf.subarray(o + 4, o + 8 + len)), `${type} CRC`)
    types.push(type)
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9] }
    if (type === 'IDAT') idat.push(data)
    o += 12 + len
  }
  assert.deepEqual([types[0], types.at(-1)], ['IHDR', 'IEND'])
  const raw = inflateSync(Buffer.concat(idat))
  assert.equal(raw.length, ihdr.h * (ihdr.w * 3 + 1))
  return { ...ihdr, raw }
}

test('encodePNG writes a valid 8-bit RGB PNG of the given size', () => {
  const rgb = new Uint8Array(5 * 3 * 3).map((_, i) => i * 7)
  const png = readPNG(encodePNG(5, 3, rgb))
  assert.deepEqual([png.w, png.h, png.depth, png.color], [5, 3, 8, 2])
  assert.deepEqual([...png.raw.subarray(1, 16)], [...rgb.subarray(0, 15)], 'row 0 round-trips')
  assert.throws(() => encodePNG(5, 4, rgb), /bytes for 5x4/)
})

test('tintFramebuffer: beam intensity x phosphor, stretched to the 4:3 face', () => {
  const term = { w: 8, h: 2, fb: Uint8Array.from([255, 0, 0, 0, 0, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0]) }
  const img = tintFramebuffer(term, [0.5, 1, 0.25])
  assert.deepEqual([img.w, img.h], [8, 6])
  assert.deepEqual([...img.px.subarray(0, 3)], [128, 255, 64])
  assert.deepEqual([...img.px.subarray(3, 6)], [0, 0, 0])
})

test('viz-preview renders an effect from the real Term into a PNG the right size', async () => {
  const r = await previewEffect('frost', { after: [120] })
  assert.equal(r.station, 'cold-wave', 'drawn on the effect\'s own station')
  assert.deepEqual(r.tiles.map((t) => t.label), ['NO TAP', 'MUTED', 'LOUD', 'KICK +32ms', 'KICK +120ms'])
  const { w, h } = r.tiles[0].img
  assert.ok(w > 600 && h === Math.round(w * 3 / 4), `${w}x${h} is not a 4:3 tile`)
  const lit = (t) => t.img.px.reduce((n, v) => n + (v > 0), 0)
  assert.ok(lit(r.tiles[0]) > 1000, 'NO TAP drew nothing')
  const img = sheet(r.tiles)
  const png = readPNG(encodePNG(img.w, img.h, img.px))
  assert.equal(png.w, img.w); assert.equal(png.h, img.h)
  assert.equal(png.w, 2 * w + 6)
})
