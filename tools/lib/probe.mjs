// SIGNAL -- the YouTube probe, shared by every tool that asks whether a
// video is really playable.
//
// 2026-08-29. This was audition.js's private machinery, and that was fine
// while candidates were the only thing anyone probed. tools/check-roster.mjs
// now asks the same questions of tracks ALREADY on the roster, and the two
// must not be able to disagree about what "playable" means -- the whole
// point of checking the roster again is that it is held to the standard
// candidates are held to. Same argument as tools/lib/roster.mjs: the logic
// that understands a thing exists once.
//
// What lives here is the part that is true of any video: fetch it, read the
// player, and flag the ways it can be unusable. What does NOT live here is
// curation judgement -- CHECK-VERSION and UNKNOWN-CHANNEL are questions you
// ask of a candidate, not of a track that is already earning its place, so
// audition.js keeps those and layers them on top of decayFlags().

// Same small concurrency cap as verify-roster.js -- polite to the endpoint.
export async function mapLimit(items, n, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) }
  }))
  return out
}

// CONSENT=YES+1 short-circuits YouTube's consent interstitial, which otherwise
// bounces a cookie-less client between redirects until undici gives up with
// "redirect count exceeded" (hit for real on a DRIFT MODE search, 2026-08-26).
export const UA = {
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0',
  cookie: 'CONSENT=YES+1',
}

export async function oembed(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, { headers: UA })
    if (r.status !== 200) return { ok: false, status: r.status }
    const j = await r.json()
    return { ok: true, status: 200, title: j.title, channel: j.author_name }
  } catch (err) {
    return { ok: false, status: 'ERR', error: String(err?.message ?? err) }
  }
}

// The watch page carries what oEmbed doesn't: length, region availability and
// whether the IFrame player is allowed to have it at all.
//
// 2026-08-26 -- this used to fail OPEN, and a GREEN ROOM curation pass proved
// how badly that reads. YouTube rate-limits the watch endpoint after a few
// hundred requests: it answers 429 and redirects to google.com/sorry, a real
// page containing none of the fields below. Every regex then missed, and the
// old defaults (`embeddable: true`, `status: '?'`, `countries/us: null`) meant
// assess() had nothing to flag -- so an ENTIRE throttled run printed clean,
// indistinguishable from a genuinely clean one except for `?` in the duration
// column. That is the worst possible shape for a tool whose only job is
// catching what oEmbed can't see. It now fails CLOSED: anything short of a
// 200 with real player data comes back `probed: false` and is flagged
// UNVERIFIED, and `embeddable` is null (unknown) rather than true.
//
// `lengthSeconds` is the liveness probe for the parse, not just a datum -- a
// page that yields no duration yielded nothing else either.
export async function playability(id) {
  const unprobed = (reason) => ({
    probed: false, reason, seconds: 0, countries: null, us: null, embeddable: null, status: '?',
  })
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: UA })
    const html = await res.text()
    if (res.status !== 200) return unprobed(`HTTP ${res.status}`)
    const seconds = +(html.match(/"lengthSeconds":"(\d+)"/)?.[1] ?? 0)
    if (!seconds) return unprobed('no player data')
    const countries = html.match(/"availableCountries":\[([^\]]*)\]/)?.[1]
    return {
      probed: true,
      seconds,
      countries: countries ? countries.split(',').length : null,
      us: countries ? countries.includes('"US"') : null,
      embeddable: !/"playableInEmbed":false/.test(html),
      status: html.match(/"playabilityStatus":\{"status":"(\w+)"/)?.[1] ?? '?',
    }
  } catch (err) { return unprobed(String(err?.message ?? err)) }
}

// The ways a video that WAS fine can stop being fine, in the order they
// matter. Split out of audition.js's assess() so check-roster.mjs applies
// exactly these, with exactly these thresholds.
//
// 2026-08-26 -- a US-available check is NOT enough, which four GREEN ROOM
// tracks demonstrated in one pass: their "- Topic" uploads were licensed in
// 1, 2, 2 and 4 countries respectively and every one of them listed the US,
// so a US-only check passed all four while they would have failed for
// everyone else. Observed counts split cleanly -- the narrow ones came in
// at 1-8, everything healthy at 115-249 -- so 20 sits in open space rather
// than on a judgement call.
export const NARROW_LICENCE_MAX = 20

export function decayFlags(e, p) {
  if (!e.ok) return [`DEAD ${e.status}${e.error ? ` (${e.error})` : ''}`]
  const flags = []
  // Loudest first: without this the row reads as "checked, nothing wrong"
  // when in fact nothing was checked at all. See playability().
  if (!p.probed) flags.push(`UNVERIFIED(${p.reason})`)
  if (p.us === false) flags.push('NOT-US')
  if (p.countries !== null && p.countries < NARROW_LICENCE_MAX) flags.push(`NARROW-LICENCE:${p.countries}`)
  if (p.embeddable === false) flags.push('NO-EMBED')
  // LOGIN_REQUIRED is the age-gate, and the IFrame player cannot satisfy it
  // -- the track plays as dead air rather than failing loudly.
  if (p.status !== 'OK' && p.status !== '?') flags.push(p.status)
  return flags
}

// A run that was throttled must never read as a run that was clean. The
// watch endpoint answers 429 and redirects to google.com/sorry after a few
// hundred requests, and that page parses as "no player data" -- so a long
// sweep degrades into a wall of UNVERIFIED that looks like findings.
// Callers stop on this rather than spending the rest of the batch on it.
export const isThrottleSignature = (p) =>
  !p.probed && (/^HTTP 4\d\d$/.test(p.reason) || p.reason === 'no player data')
