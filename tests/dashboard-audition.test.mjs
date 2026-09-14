// tools/network.html's audition panel -- what the page DRAWS for a run.
//
// The page is a module script inside HTML, so nothing imports it; this test
// cuts the real renderAuditionResult() out of the file and runs it against a
// stub of the page's el()/help() helpers. Reading the function off the file
// (rather than a copy) is the point: the finding it guards was the page
// silently not rendering a field the server already sent.
//
// Run: node --test tests/
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const html = readFileSync(path.join(here, '..', 'tools', 'network.html'), 'utf8')

/** A detached node tree: enough of the DOM for el()/appendChild/innerHTML. */
function node(tag, attrs = {}, kids = []) {
  const n = {
    tag, attrs, kids: kids.flat().filter((k) => k != null),
    appendChild(c) { n.kids.push(c); return c },
    addEventListener() {},
    style: {},
    set innerHTML(v) { n.kids = [] },
  }
  return n
}
const text = (n) => typeof n === 'string' ? n
  : [n.attrs?.html ?? '', ...n.kids.map(text)].join(' ')
const byClass = (n, cls) => typeof n === 'string' ? []
  : [...(String(n.attrs?.class ?? '').split(' ').includes(cls) ? [n] : []), ...n.kids.flatMap((k) => byClass(k, cls))]

function render(result) {
  const start = html.indexOf('function renderAuditionResult(')
  assert.ok(start > 0, 'renderAuditionResult() is still in tools/network.html')
  const end = html.indexOf('\n}\n', start)
  const src = html.slice(start, end + 2)
  const make = new Function('audResult', 'el', 'help', 'flagClass', 'flagHelp',
    `${src}\nreturn renderAuditionResult`)
  const el = (tag, attrs, ...kids) => node(tag, attrs, kids)
  const help = (h) => el('p', { class: 'help', html: h })
  const out = node('div')
  make(result, el, help, () => 'flag', () => '')(out, 'after-hours')
  return out
}

const base = { station: { id: 'after-hours', callsign: 'AFTER HOURS' }, profile: null, mode: 'search', unverified: 0, unverifiedReasons: [] }

test('a search that failed to run is said on the panel, not drawn as an empty grid', () => {
  // 2026-09-13 (audit, H1) -- audition.js began returning JSON with
  // searchFailures that day; the page never read the field, so the panel
  // (which sends one search) drew a clean-looking empty result with no word.
  const out = render({ ...base, rows: [], searchFailures: [{ query: 'Miles Davis Blue in Green', error: 'fetch failed' }] })
  const banners = byClass(out, 'unverified-banner')
  assert.equal(banners.length, 1, 'a run-level banner is drawn for the failed search')
  assert.match(text(banners[0]), /FAILED/)
  assert.match(text(banners[0]), /Miles Davis Blue in Green/, 'the banner names the search')
  assert.match(text(out), /no candidates/, 'and the empty result says so')
})

test('an honest empty result says "no candidates" and raises no banner', () => {
  const out = render({ ...base, rows: [], searchFailures: [] })
  assert.equal(byClass(out, 'unverified-banner').length, 0)
  assert.match(text(out), /no candidates — the search found nothing/)
})
