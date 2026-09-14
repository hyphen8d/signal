// tools/audition.js as a whole process, offline. The probe rules it shares
// with check-roster.mjs are unit-tested in probe.test.mjs; this is the one
// thing only the CLI can get wrong -- what a RUN reports when part of it
// could not happen.
//
// Run: node --test tests/
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const AUDITION = path.join(here, '..', 'tools', 'audition.js')
// Every fetch rejects the way a dropped connection does ("fetch failed"), so
// the run never touches the network and every search errors.
const OFFLINE = 'data:text/javascript,globalThis.fetch=()=>Promise.reject(new TypeError("fetch failed"))'

test('a search that fails is reported as a failure, not as zero results', () => {
  // 2026-09-13 -- both AFTER HOURS curation agents hit this on the station's
  // founding pass: search() logged the error to stderr and returned [], so a
  // batch with dead searches exited 0 looking merely short, and when every
  // search died the run said "Nothing to check. Pass video IDs" -- advice for
  // a wrong invocation, not a network failure. The --json summary is what
  // the dashboard renders, so the failures have to be in it too.
  const r = spawnSync(process.execPath, [
    `--import=${OFFLINE}`, AUDITION, '--station=after-hours', '--json',
    '--search=Miles Davis Blue in Green', '--search=Bill Evans Peace Piece',
  ], { encoding: 'utf8', timeout: 30000 })
  assert.equal(r.status, 1, `an incomplete run exits 1 (got ${r.status}); stderr:\n${r.stderr}`)
  assert.doesNotMatch(r.stderr, /Nothing to check/, 'failed searches are not reported as a missing argument')
  assert.match(r.stderr, /2\/2 search\(es\) FAILED/, 'the run says, once, that its searches failed')
  const summary = JSON.parse(r.stdout)
  assert.deepEqual(summary.searchFailures.map((f) => f.query),
    ['Miles Davis Blue in Green', 'Bill Evans Peace Piece'], 'the JSON summary names every failed search')
  assert.deepEqual(summary.rows, [])
})

test('pasted ids are checked alongside search results, not replaced by them', () => {
  // 2026-09-13 (audit, M8) -- the dashboard's form sends a search and pasted
  // ids together, and `candidates = found.flat()` threw the ids away without
  // a word. One search here finds AAAAAAAAAAA, one fails, and BBBBBBBBBBB is
  // pasted: both ids must come back as rows. Every other fetch rejects, so
  // the rows are dead -- which is fine; the question is which ids were asked.
  const stub = 'data:text/javascript,' + encodeURIComponent(
    'globalThis.fetch = async (u) => { u = String(u);' +
    ' if (u.includes("/results?") && u.includes("good")) return new Response(\'"videoId":"AAAAAAAAAAA"\');' +
    ' throw new TypeError("fetch failed") }')
  const r = spawnSync(process.execPath, [
    `--import=${stub}`, AUDITION, '--station=after-hours', '--json',
    '--search=good', '--search=bad', 'BBBBBBBBBBB',
  ], { encoding: 'utf8', timeout: 30000 })
  const summary = JSON.parse(r.stdout)
  assert.deepEqual(summary.rows.map((row) => row.id).sort(), ['AAAAAAAAAAA', 'BBBBBBBBBBB'],
    `both the search hit and the pasted id are checked; stderr:\n${r.stderr}`)
  assert.deepEqual(summary.searchFailures.map((f) => f.query), ['bad'], 'the failed search is still reported')
  assert.equal(r.status, 1, 'a run with a failed search is still incomplete')
})
