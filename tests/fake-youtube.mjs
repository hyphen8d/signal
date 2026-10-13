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
// such as 'LOGIN_REQUIRED' / 'UNPLAYABLE'.
const cfg = JSON.parse(process.env.SIGNAL_FAKE_YT || '{}')
const answerFor = (id) => cfg.ids?.[id] ?? cfg.default ?? 'ok'
const COUNTRIES = Array.from({ length: 120 }, (_, i) => `"C${i}"`).concat('"US"').join(',')

const reply = (status, url, body) => ({
  status, ok: status >= 200 && status < 300, url,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
})

globalThis.fetch = async (input) => {
  const url = String(input)
  const id = url.match(/[?&]v=([\w-]{11})/)?.[1]
  if (url.includes('/oembed?')) return reply(200, url, { title: `fake ${id}`, author_name: 'fake channel' })
  if (url.includes('/watch?')) {
    const a = answerFor(id)
    if (a === 'throttle') return reply(429, 'https://www.google.com/sorry/index', 'sorry')
    if (a === 'unverified') return reply(200, url, '<html>no player here</html>')
    const status = a === 'ok' ? 'OK' : a
    return reply(200, url, `{"playabilityStatus":{"status":"${status}"},"lengthSeconds":"200","availableCountries":[${COUNTRIES}]}`)
  }
  throw new Error(`fake-youtube: unexpected fetch ${url}`)
}
