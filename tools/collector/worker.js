// SIGNAL -- the session-summary collector, as a Cloudflare Worker.
//
// Accepts one anonymous summary per visit (see metrics.js and PRIVACY.md),
// folds it into daily totals, and serves those totals back to the admin
// dashboard. It is deliberately the smallest thing that answers the
// question: which stations get listened to, for how long, and which
// features ever get found.
//
//   POST /collect   <- the beacon. No auth: anyone can post, which is fine
//                      (see "What abuse looks like" below).
//   GET  /stats     <- daily totals. Requires the read token.
//
// WHAT THIS MUST NOT DO, and the reason each one is a rule rather than a
// preference -- these are the properties that make the client side honest:
//
//   * Never store, log or hash the IP. Workers hand you CF-Connecting-IP on
//     every request; this file reads it exactly once, to bucket a rate
//     limit, and that bucket key is a truncated hash with a daily salt that
//     is never written down. A stored IP -- even hashed -- would rebuild the
//     visitor identity the payload went out of its way not to contain.
//   * Never store a raw record. Only counters. There is no table of visits
//     here to leak, subpoena or accidentally join against anything, because
//     each summary is added into a day's totals and then dropped.
//   * Never grow a key per visitor. The KV keyspace is one entry per day.
//
// WHAT ABUSE LOOKS LIKE, and why the endpoint is open anyway: someone can
// post junk and skew a day's numbers. That is the whole exposure -- there is
// no data to steal and nothing to escalate into, because the only thing
// stored is a set of integers. The alternative, a shared secret in the
// client bundle, is not a secret; it is a string in a public JavaScript file
// that would buy nothing and imply a guarantee that does not exist. The rate
// limit below is there to make skewing tedious, not impossible.

const SCHEMA_VERSION = 1
const MAX_BODY_BYTES = 2048
const RATE_PER_MINUTE = 12
const RETAIN_DAYS = 400

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/collect') return collect(req, env)
    if (req.method === 'GET' && url.pathname === '/stats') return stats(req, env)
    // No CORS headers anywhere and no OPTIONS handler, on purpose.
    // sendBeacon fires a simple request that needs no preflight, and /stats
    // is read by the admin server rather than by a browser page -- so
    // nothing legitimate here needs CORS, and adding it would only widen
    // what a hostile tab can reach.
    return new Response('not found', { status: 404 })
  },
}

async function collect(req, env) {
  // Read the IP once, use it once, never write it anywhere.
  const ip = req.headers.get('CF-Connecting-IP') || ''
  if (!(await underRateLimit(env, ip))) return new Response('', { status: 429 })

  // Length-capped before parsing: a summary is a few hundred bytes, and
  // there is no reason to hand a megabyte to JSON.parse.
  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return new Response('', { status: 413 })

  let body
  try { body = JSON.parse(raw) } catch { return new Response('', { status: 400 }) }
  const rec = sanitise(body)
  // 204 whatever happens next. The beacon cannot see the response and the
  // listener must never be affected by it, so a rejected record is silent.
  if (!rec) return new Response('', { status: 204 })

  const day = new Date().toISOString().slice(0, 10)
  const key = `day:${day}`
  const cur = (await env.SIGNAL_STATS.get(key, 'json')) || emptyDay()

  cur.sessions++
  cur.minutes += rec.mins
  cur.modes[rec.mode] = (cur.modes[rec.mode] || 0) + 1
  cur.builds[rec.v] = (cur.builds[rec.v] || 0) + 1
  cur.failures += rec.failures
  for (const [id, mins] of Object.entries(rec.stations)) {
    cur.stations[id] = (cur.stations[id] || 0) + mins
  }
  for (const f of rec.used) cur.features[f] = (cur.features[f] || 0) + 1
  for (const [k, v] of Object.entries(rec.consent)) {
    cur.consent[k] = cur.consent[k] || { yes: 0, no: 0 }
    cur.consent[k][v]++
  }

  // A read-modify-write race between two concurrent beacons can drop one
  // record. That is accepted rather than solved: the alternative is a
  // Durable Object for a hobby project's daily counters, and losing the
  // occasional session changes no decision anyone would make from a SHARE.
  // If this ever needs to be exact, that is the upgrade -- not a lock here.
  await env.SIGNAL_STATS.put(key, JSON.stringify(cur), {
    expirationTtl: RETAIN_DAYS * 86400,
  })
  return new Response('', { status: 204 })
}

/** Rebuild the record from scratch rather than trusting what arrived. A
 *  collector that stores whatever it is posted is how a counter becomes a
 *  place arbitrary strings live; everything below is bounded in length,
 *  count and type before it can reach storage.
 *
 *  Exported only so tests/collector.test.mjs can reach it: this is the trust
 *  boundary of the whole feature, and an untested one would be a boundary in
 *  name only. */
export function sanitise(b) {
  if (!b || typeof b !== 'object') return null
  if (b.s !== SCHEMA_VERSION) return null
  const mins = int(b.mins, 0, 24 * 60)
  if (mins === null) return null
  const out = {
    v: str(b.v, 24),
    mode: b.mode === 'mobile' ? 'mobile' : 'desktop',
    mins,
    stations: {},
    used: [],
    consent: {},
    failures: int(b.failures, 0, 500) ?? 0,
  }
  if (b.stations && typeof b.stations === 'object') {
    for (const [k, v] of Object.entries(b.stations).slice(0, 20)) {
      const id = key(k, 32)
      const m = int(v, 0, 24 * 60)
      if (id && m) out.stations[id] = m
    }
  }
  if (Array.isArray(b.used)) {
    out.used = [...new Set(b.used.map((x) => key(x, 24)).filter(Boolean))].slice(0, 40)
  }
  if (b.consent && typeof b.consent === 'object') {
    for (const [k, v] of Object.entries(b.consent).slice(0, 8)) {
      const kind = key(k, 16)
      if (kind && (v === 'yes' || v === 'no')) out.consent[kind] = v
    }
  }
  return out
}

const str = (x, n) => String(x ?? '').slice(0, n).replace(/[^\w.:-]/g, '')

/** A map KEY -- a station id, a feature name, a consent kind. Rejects rather
 *  than cleans, which is the opposite of str() above and deliberate: cleaning
 *  'bad id!!' into 'badid' does not reject anything, it INVENTS a station id
 *  that never existed and files real minutes under it, where it then shows up
 *  in the dashboard as a station nobody can find. A key that is not already
 *  clean is not a key. (Caught by tests/metrics.test.mjs on its first run.) */
function key(x, n) {
  // Must already BE a string. Coercing here would let the number 42 through
  // as the feature name '42' -- valid-looking, and invented.
  if (typeof x !== 'string') return null
  if (!x || x.length > n || !/^[\w.:-]+$/.test(x)) return null
  return x
}
function int(x, lo, hi) {
  const n = Math.floor(Number(x))
  if (!Number.isFinite(n) || n < lo || n > hi) return null
  return n
}
const emptyDay = () => ({
  sessions: 0, minutes: 0, failures: 0,
  stations: {}, features: {}, modes: {}, builds: {}, consent: {},
})

/** One counter per (truncated-hash-of-IP, minute), expiring after a minute.
 *  The salt rotates daily and is never stored, so yesterday's keys cannot be
 *  recomputed from anything that still exists. */
async function underRateLimit(env, ip) {
  if (!ip) return true
  const minute = Math.floor(Date.now() / 60000)
  const day = new Date().toISOString().slice(0, 10)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}:${ip}`))
  const short = [...new Uint8Array(digest)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('')
  const key = `rl:${minute}:${short}`
  const n = Number((await env.SIGNAL_STATS.get(key)) || 0)
  if (n >= RATE_PER_MINUTE) return false
  await env.SIGNAL_STATS.put(key, String(n + 1), { expirationTtl: 120 })
  return true
}

async function stats(req, env) {
  // Constant-time-ish compare is overkill for a read token on daily
  // counters, but the token does gate the only route that returns anything,
  // so it is checked before any work happens.
  const given = req.headers.get('Authorization') || ''
  if (!env.READ_TOKEN || given !== `Bearer ${env.READ_TOKEN}`) {
    return new Response('unauthorized', { status: 401 })
  }
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 30))
  const out = []
  const now = Date.now()
  for (let i = 0; i < days; i++) {
    const day = new Date(now - i * 86400000).toISOString().slice(0, 10)
    const rec = await env.SIGNAL_STATS.get(`day:${day}`, 'json')
    if (rec) out.push({ day, ...rec })
  }
  return new Response(JSON.stringify({ days: out }), {
    headers: { 'content-type': 'application/json' },
  })
}
