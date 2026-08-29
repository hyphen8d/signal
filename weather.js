// SIGNAL -- the weather module: where the set gets a local forecast, and how
// a WMO code becomes a word narrow enough to sit on row 0.
//
// 2026-08-29. "Would a real radio have this?" is the test that governs what
// gets added here, and weather is one of the few things it answers with an
// unambiguous yes -- a broadcast station reading out the local forecast is
// not a feature, it is most of what daytime radio IS. That is the whole
// argument for this existing; it needed no other.
//
// Pure data and pure functions. No DOM, no drawing, no program state -- the
// card and the row-0 readout live in ui/weather.js. That split is what lets
// the bucketing and the code table be tested in Node with no browser at all,
// which matters because they are the parts most likely to be wrong.
//
// Source: Open-Meteo. Chosen because it is keyless and CORS-open, both of
// which this page needs -- SIGNAL is a static site on Pages with no backend
// to proxy through and nowhere to hide an API key. Both properties were
// checked against the live service rather than taken from its docs, and the
// CORS one is worth spelling out because it looks absent when you test it
// wrong: the service only emits access-control-allow-origin when a request
// actually carries an Origin header, so a `fetch` from Node shows no CORS
// header at all and tells you nothing. curl with an explicit Origin (or a
// real browser) shows `access-control-allow-origin: *`.

// The station's own unit call. Fahrenheit for a US-shaped set -- the SG-1 is
// an atomic-age American receiver -- but taken from the browser's locale
// where that disagrees, since the visitor is the one reading it.
export function unitsForLocale(locale) {
  const l = String(locale || 'en-US')
  // The three holdouts, plus the US territories that follow it.
  return /^en-US|^en-LR|^my/.test(l) ? 'fahrenheit' : 'celsius'
}
export const unitSuffix = (units) => (units === 'fahrenheit' ? 'F' : 'C')

// WMO weather interpretation codes -> a word that fits the grid.
//
// Capped at SEVEN characters on purpose: the row-0 readout has thirteen
// columns between the brand plate and the clock, and "-12F " is five of
// them at the worst reading. Every label here is ASCII -- the BDF font is a
// fixed set of glyphs and a missing one silently renders as "?", so the
// degree sign and every weather pictograph are off the table by
// construction rather than by taste.
const WMO = [
  [[0], 'CLEAR'], [[1], 'FAIR'], [[2], 'PARTLY'], [[3], 'CLOUDY'],
  [[45, 48], 'FOG'],
  [[51, 53, 55], 'DRIZZLE'], [[56, 57], 'ICE DRZ'],
  [[61, 63, 65], 'RAIN'], [[66, 67], 'ICE RN'],
  [[71, 73, 75, 77], 'SNOW'],
  [[80, 81, 82], 'SHOWERS'],
  [[85, 86], 'SNOW'],
  [[95], 'STORM'], [[96, 99], 'HAIL'],
]
// Row 0 has far less room than the card, so it gets its own shorter set.
// Longest reading is "-12C SHWRS" at ten columns, which fits the eleven
// between the brand plate and the clock with a clear column at each end.
// Kept as a separate table rather than truncating wmoLabel(), because a
// truncated "SHOWER" or "DRIZZL" reads as a rendering fault.
const WMO_SHORT = {
  CLOUDY: 'CLDY', PARTLY: 'PART', DRIZZLE: 'DRZL', 'ICE DRZ': 'ICEDZ',
  'ICE RN': 'ICERN', SHOWERS: 'SHWRS',
}
export function wmoShort(code) {
  const full = wmoLabel(code)
  return WMO_SHORT[full] || full
}
export function wmoLabel(code) {
  for (const [codes, label] of WMO) if (codes.includes(code)) return label
  return '--'
}

// The three parts of the day, as a radio would read them out. Hours are
// local to the forecast location (Open-Meteo's timezone=auto), not to
// whoever is looking at the screen -- those are usually the same and the
// difference only shows up on a VPN, where the location is wrong anyway.
export const DAY_PARTS = [
  { name: 'MORNING', from: 6, to: 11 },
  { name: 'AFTERNOON', from: 12, to: 17 },
  { name: 'EVENING', from: 18, to: 23 },
]

/** Reduce a run of hourly readings to one line.
 *
 *  Temperature is the part's HIGH rather than its mean: a forecast is read
 *  to decide what to wear, and the number that decides that is the peak, not
 *  the average of a six-hour window that includes the hour you are asleep.
 *
 *  The condition is the MAXIMUM WMO code in the window, which works because
 *  the code table is already ordered roughly by severity -- clear 0, cloud
 *  1-3, fog 45, drizzle 5x, rain 6x, snow 7x, showers 8x, storm 9x. So an
 *  afternoon with four clear hours and two of rain reads RAIN, which is the
 *  useful answer; a mean or a modal code would read CLEAR and be technically
 *  defensible and practically a lie. Not a real severity model, and it does
 *  not need to be -- it needs to not say CLEAR on a day it rains. */
export function reducePart(temps, codes) {
  const t = temps.filter((n) => Number.isFinite(n))
  const c = codes.filter((n) => Number.isFinite(n))
  if (!t.length || !c.length) return null
  return { temp: Math.round(Math.max(...t)), code: Math.max(...c) }
}

/** Split Open-Meteo's flat 24-hour arrays into the three day parts.
 *
 *  `hourly.time` entries are ISO strings ALREADY in the forecast location's
 *  own timezone and carrying no zone marker ("2026-08-29T14:00"), because
 *  timezone=auto resolved them server-side. The hour is therefore characters
 *  11-13 and is read as characters, deliberately.
 *
 *  Not, as an earlier draft of this comment claimed, because `new Date()`
 *  would shift them -- for a zoneless string it would not; the engine parses
 *  it as local and getHours() gives back the same number. The reason is
 *  narrower and duller: parsing is an engine behaviour this has no need to
 *  depend on. It would start mattering the moment the field grew a `Z` or an
 *  offset, or was read with getUTCHours by someone tidying up, and both of
 *  those are silent -- every bucket shifts and every line still looks
 *  plausible. Reading the characters cannot drift that way. */
export function bucketHours(hourly) {
  if (!hourly || !Array.isArray(hourly.time)) return []
  const hourOf = (iso) => Number(String(iso).slice(11, 13))
  return DAY_PARTS.map((part) => {
    const idx = hourly.time
      .map((iso, i) => [hourOf(iso), i])
      .filter(([h]) => h >= part.from && h <= part.to)
      .map(([, i]) => i)
    const got = reducePart(idx.map((i) => hourly.temperature_2m?.[i]), idx.map((i) => hourly.weather_code?.[i]))
    return { name: part.name, ...(got || { temp: null, code: null }) }
  })
}

export function forecastUrl(lat, lon, units) {
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    current: 'temperature_2m,weather_code',
    hourly: 'temperature_2m,weather_code',
    forecast_days: '1', timezone: 'auto', temperature_unit: units,
  })
  return `https://api.open-meteo.com/v1/forecast?${q}`
}

/** Geolocation is gated on a SECURE CONTEXT, and this is worth knowing
 *  before you go looking for a bug that is not there: on plain http the API
 *  object exists, getCurrentPosition() runs, and the error callback fires
 *  with code 1 -- PERMISSION_DENIED, the same code a real refusal gives --
 *  carrying "Only secure origins are allowed". Verified in Chrome against
 *  this app served over http on 2026-08-29.
 *
 *  So the two are indistinguishable from the callback alone, and conflating
 *  them is a real bug rather than a tidiness point: the card records a
 *  decline in localStorage, so a visitor who pressed [W] once on an insecure
 *  origin would be remembered as having said no forever, on every origin,
 *  including the https one where it would have worked.
 *
 *  Production is https and unaffected. Local development over an IP is not:
 *  http://<tailscale-ip>:8000 is not a trustworthy origin, so this feature
 *  cannot be exercised there at all. Use localhost, which IS trustworthy by
 *  spec, or the deployed site. */
export const canLocate = (win = globalThis) =>
  !!(win && win.isSecureContext && win.navigator && win.navigator.geolocation)

/** The browser's own permission dialog. Deliberately NOT called anywhere
 *  except from the card's [Y] -- see ui/weather.js for why that matters, and
 *  audio/tap.js for the same argument made at greater length about the
 *  microphone. A refusal is an ordinary outcome, not an error: it resolves
 *  to null and the caller shows nothing. */
export function requestLocation(nav = globalThis.navigator, opts = {}) {
  return new Promise((resolve) => {
    if (!nav || !nav.geolocation) { resolve(null); return }
    let settled = false
    const done = (v) => { if (!settled) { settled = true; resolve(v) } }
    // Belt and braces on top of the API's own timeout: on some browsers a
    // dismissed (rather than denied) prompt never calls either callback, and
    // a card that waits forever for an answer nobody is going to give is a
    // hang, not a permission flow.
    const guard = setTimeout(() => done(null), opts.hardTimeoutMs ?? 12000)
    nav.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(guard); done({ lat: pos.coords.latitude, lon: pos.coords.longitude }) },
      () => { clearTimeout(guard); done(null) },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 },
    )
  })
}

/** One fetch, shaped for the card and the row-0 readout. Returns null on
 *  anything going wrong -- there is no error state to draw, the readout is
 *  simply absent, exactly as it is before anyone has consented. */
export async function fetchWeather(lat, lon, units, fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(forecastUrl(lat, lon, units))
    if (!res.ok) return null
    const j = await res.json()
    if (!j || !j.current) return null
    return {
      at: Date.now(),
      units,
      current: { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code },
      parts: bucketHours(j.hourly),
      timezone: j.timezone || null,
    }
  } catch (e) { return null }
}

// The consent card's copy. Here rather than inline in ui/weather.js for one
// reason: the card interior is fifty columns and a line over that writes
// straight through the box's right border and out the other side. That is
// not hypothetical -- the first draft of this card did exactly that, on a
// 52-character line, and it took rendering the thing to see it. Out here the
// width is a property of data, and tests/weather.test.mjs asserts it.
export const CARD_INNER_W = 50
// 48, not 50: the interior is fifty columns and a line that fills it edge to
// edge leaves the text touching both borders, which reads as a fault.
export const CARD_TEXT_W = 48
export const CONSENT_COPY = [
  'Press [Y] and your browser asks where you are.',
  'Used for one forecast lookup, then forgotten.',
  'Nothing is stored, nothing leaves this page.',
]
export const INSECURE_COPY = [
  'Location needs a secure connection.',
  'This page is on http, so the browser refuses.',
]

// How long a reading stands before it is worth asking again. Weather does
// not move fast enough to justify a request per redraw, and the row-0
// readout repaints on every chrome rebuild.
export const WX_MAX_AGE_MS = 15 * 60 * 1000
export const isStale = (wx, now = Date.now()) => !wx || (now - wx.at) > WX_MAX_AGE_MS
