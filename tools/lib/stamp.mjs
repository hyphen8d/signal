// The build stamp's arithmetic, shared by tools/stamp.js and tools/ship.mjs
// (2026-10-20). Format: YYYY-MM-DD.N, N counting up within a UTC day.
//
// stamp.js only ever needed "one more than what is in build.json". ship.mjs
// needs more than that: the stamp it commits has to be NEWER than the one on
// origin/main, because a branch that stamps the same value a parallel
// session already shipped makes its own deploy a cache no-op -- main.js
// imports every module as ?v=<stamp>, and an unchanged stamp is an
// unchanged URL, so returning visitors keep the previous build for up to
// Pages' 10 minutes (and an open tab's tickBuild() never sees a new build
// at all). That nearly happened once, two sessions shipping on one day.

const SHAPE = /^(\d{4}-\d{2}-\d{2})\.(\d+)$/

/** -1 / 0 / 1. A stamp that is not YYYY-MM-DD.N (main.js's Date.now()
 *  fallback, an empty file) sorts below every real one. */
export function compareStamps(a, b) {
  const ma = SHAPE.exec(String(a || '')), mb = SHAPE.exec(String(b || ''))
  if (!ma || !mb) return (ma ? 1 : 0) - (mb ? 1 : 0)
  if (ma[1] !== mb[1]) return ma[1] < mb[1] ? -1 : 1
  return Math.sign(Number(ma[2]) - Number(mb[2]))
}

/** The stamp after the newest of `prevs`, dated `today` (YYYY-MM-DD, UTC)
 *  or later. Same-day stamps count up; an older day starts today at .1; a
 *  stamp from a LATER day than today (this clock behind the one that wrote
 *  it) counts up on that day rather than going backwards. */
export function nextStamp(prevs, today = new Date().toISOString().slice(0, 10)) {
  const list = (Array.isArray(prevs) ? prevs : [prevs]).filter(Boolean)
  const newest = list.reduce((m, s) => (compareStamps(s, m) > 0 ? s : m), '')
  const m = SHAPE.exec(newest)
  if (!m || m[1] < today) return `${today}.1`
  return `${m[1]}.${Number(m[2]) + 1}`
}
