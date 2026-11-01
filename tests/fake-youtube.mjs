// A stand-in for the two YouTube endpoints tools/lib/probe.mjs asks, loaded
// with `node --import` so check-roster.mjs runs its REAL main() -- queue,
// probe, record, summary -- with no network. Not a test file itself (no
// .test. in the name); tests/health-wiring.test.mjs preloads it.
//
// 2026-10-12 (audit, M5). The confirm-before-notify wiring had tests only of
// the pure helpers on hand-written summaries, and two mutations of the
// wiring itself -- `flaggedConfirmed: bad.length`, `strikes: 0` -- left all
// of them green. Driving the real script is what can see those.
//
// The responses are shaped after what probe.mjs reads off the real thing,
// not a spec: oEmbed's JSON; the watch page's lengthSeconds /
// availableCountries / playabilityStatus fields; and a throttle as YouTube
// actually sends one -- a 429 whose final URL is google.com/sorry (see
// playability()'s 2026-09-12 note).
//
// SIGNAL_FAKE_YT is JSON: { "default": <answer>, "ids": { "<youtubeId>": <answer> } }
// where an answer is 'ok', 'throttle', 'unverified', or a playabilityStatus
// such as 'LOGIN_REQUIRED' / 'UNPLAYABLE' -- all about the WATCH page, with
// oEmbed answering 200 -- or one about oEmbed itself (2026-11-01, audit M3):
// 'gone' (404, a takedown), 'private' (401), 'oembed-throttle' (429 every
// time), 'oembed-error' (the request throws), 'oembed-flaky' (429 on the
// first ask in this process, 200 after). Those are the shapes oembed()
// reads -- a status code, or a thrown fetch -- and a gone video's watch page
// is never asked for, because the deep probe stops at a non-200 oEmbed.
// SIGNAL_FAKE_YT_LOG, if set, gets one line per request ("oembed <id>" /
// "watch <id>"), so a test can see the order the probe asked in.
const cfg = JSON.parse(process.env.SIGNAL_FAKE_YT || '{}')
const answerFor = (id) => cfg.ids?.[id] ?? cfg.default ?? 'ok'
const COUNTRIES = Array.from({ length: 120 }, (_, i) => `"C${i}"`).concat('"US"').join(',')

const reply = (status, url, body) => ({
  status, ok: status >= 200 && status < 300, url,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
})

const asked = new Map()
const { appendFileSync } = await import('node:fs')
globalThis.fetch = async (input) => {
  const url = String(input)
  const id = url.match(/[?&]v=([\w-]{11})/)?.[1]
  const kind = url.includes('/oembed?') ? 'oembed' : 'watch'
  if (process.env.SIGNAL_FAKE_YT_LOG) appendFileSync(process.env.SIGNAL_FAKE_YT_LOG, `${kind} ${id}\n`)
  if (url.includes('/oembed?')) {
    const a = answerFor(id)
    const n = (asked.get(id) ?? 0) + 1
    asked.set(id, n)
    if (a === 'gone') return reply(404, url, 'Not Found')
    if (a === 'private') return reply(401, url, 'Unauthorized')
    if (a === 'oembed-throttle' || (a === 'oembed-flaky' && n === 1)) return reply(429, url, 'Too Many Requests')
    if (a === 'oembed-error') throw new TypeError('fetch failed')
    return reply(200, url, { title: `fake ${id}`, author_name: 'fake channel' })
  }
  if (url.includes('/watch?')) {
    const a = answerFor(id)
    if (a === 'throttle') return reply(429, 'https://www.google.com/sorry/index', 'sorry')
    if (a === 'unverified') return reply(200, url, '<html>no player here</html>')
    const status = a === 'ok' ? 'OK' : a
    return reply(200, url, `{"playabilityStatus":{"status":"${status}"},"lengthSeconds":"200","availableCountries":[${COUNTRIES}]}`)
  }
  throw new Error(`fake-youtube: unexpected fetch ${url}`)
}
