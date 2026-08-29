// weather.js -- the pure half of the weather feature. No DOM, no network:
// bucketHours(), reducePart(), wmoLabel() and the unit call all take data
// and return data, which is exactly why they live in their own module.
//
// These are the parts that can be quietly wrong. A drawing bug is visible
// the moment you look at the screen; a bucketing bug puts the afternoon's
// weather on the morning line and looks completely plausible.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bucketHours, reducePart, wmoLabel, unitsForLocale, unitSuffix,
  DAY_PARTS, forecastUrl, isStale, WX_MAX_AGE_MS,
  wmoShort, CONSENT_COPY, INSECURE_COPY, CARD_TEXT_W, canLocate,
} from '../weather.js'

/** A full local day of hourly readings, in Open-Meteo's shape. */
const day = (temps, codes) => ({
  time: Array.from({ length: 24 }, (_, h) => `2026-08-29T${String(h).padStart(2, '0')}:00`),
  temperature_2m: temps,
  weather_code: codes,
})
const flat = (v) => Array.from({ length: 24 }, () => v)

test('the three parts cover morning, afternoon and evening', () => {
  assert.deepEqual(DAY_PARTS.map((p) => p.name), ['MORNING', 'AFTERNOON', 'EVENING'])
  // No overlap and no gap between them.
  for (let i = 1; i < DAY_PARTS.length; i++) {
    assert.equal(DAY_PARTS[i].from, DAY_PARTS[i - 1].to + 1)
  }
})

test('each part reads the hours it actually covers, not the whole day', () => {
  const temps = flat(50)
  // One hot hour inside the afternoon window, nowhere else.
  temps[14] = 99
  const parts = bucketHours(day(temps, flat(0)))
  assert.equal(parts.find((p) => p.name === 'MORNING').temp, 50)
  assert.equal(parts.find((p) => p.name === 'AFTERNOON').temp, 99)
  assert.equal(parts.find((p) => p.name === 'EVENING').temp, 50)
})

test('temperature is the part HIGH, not its mean', () => {
  const temps = flat(0)
  // Afternoon 12..17: one 80, five 40s. Mean is ~47, high is 80.
  for (let h = 12; h <= 17; h++) temps[h] = 40
  temps[15] = 80
  const pm = bucketHours(day(temps, flat(0))).find((p) => p.name === 'AFTERNOON')
  assert.equal(pm.temp, 80, 'a mean here would read 47 and understate the day')
})

test('a part that rains for one hour does not read CLEAR', () => {
  const codes = flat(0)          // clear all day...
  codes[15] = 65                 // ...except an hour of heavy rain
  const pm = bucketHours(day(flat(60), codes)).find((p) => p.name === 'AFTERNOON')
  assert.equal(wmoLabel(pm.code), 'RAIN')
})

test('the hour is read as characters, not parsed as a date', () => {
  // First draft of this test set the morning hours to a unique value and
  // asserted it came back. That passed under `new Date(iso).getHours()` too
  // -- a zoneless string parses as local and gives the same hour -- so it
  // proved nothing about the implementation. This does: the timestamps below
  // are NOT valid dates, so anything routing them through Date() yields NaN
  // and drops every bucket, while character-slicing reads them fine.
  const temps = flat(10)
  for (let h = 6; h <= 11; h++) temps[h] = 77
  const unparseable = {
    ...day(temps, flat(0)),
    // 11 characters before the hour, exactly as "2026-08-29T" is -- the
    // prefix must be the right LENGTH or this tests the fixture, not the code.
    time: Array.from({ length: 24 }, (_, h) => `not-a-date!${String(h).padStart(2, '0')}:00`),
  }
  const am = bucketHours(unparseable).find((p) => p.name === 'MORNING')
  assert.equal(am.temp, 77, 'hours must come from the string, not from Date parsing')
})

test('missing readings degrade to nulls rather than NaN', () => {
  const parts = bucketHours(day(flat(undefined), flat(undefined)))
  for (const p of parts) {
    assert.equal(p.temp, null)
    assert.equal(p.code, null)
  }
  assert.equal(reducePart([], []), null)
  assert.equal(reducePart([NaN, undefined], [NaN]), null)
})

test('a malformed payload returns no parts instead of throwing', () => {
  assert.deepEqual(bucketHours(null), [])
  assert.deepEqual(bucketHours({}), [])
  assert.deepEqual(bucketHours({ time: 'not an array' }), [])
})

test('every label fits the row-0 readout', () => {
  // The readout has 13 columns and the temperature takes up to five of them
  // ("-12C"), so a label over seven would be truncated on screen.
  const codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67,
    71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]
  for (const c of codes) {
    const l = wmoLabel(c)
    assert.ok(l.length <= 7, `code ${c} -> "${l}" is ${l.length} chars, over the 7 the grid allows`)
    assert.match(l, /^[A-Z .-]+$/, `code ${c} -> "${l}" must be ASCII: the BDF font renders a missing glyph as "?"`)
  }
})

test('an unknown code is a dash, not a crash or a blank', () => {
  assert.equal(wmoLabel(1234), '--')
  assert.equal(wmoLabel(undefined), '--')
})

test('units follow the locale, and the suffix follows the units', () => {
  assert.equal(unitsForLocale('en-US'), 'fahrenheit')
  assert.equal(unitsForLocale('en-GB'), 'celsius')
  assert.equal(unitsForLocale('de-DE'), 'celsius')
  assert.equal(unitsForLocale(undefined), 'fahrenheit')  // the set's own default
  assert.equal(unitSuffix('fahrenheit'), 'F')
  assert.equal(unitSuffix('celsius'), 'C')
})

test('the request asks for one local day and nothing extra', () => {
  const u = new URL(forecastUrl(37.77, -122.42, 'fahrenheit'))
  assert.equal(u.searchParams.get('forecast_days'), '1')
  assert.equal(u.searchParams.get('timezone'), 'auto', 'without this the hours come back in UTC and every bucket shifts')
  assert.equal(u.searchParams.get('temperature_unit'), 'fahrenheit')
  assert.ok(!u.searchParams.has('apikey'), 'this service is keyless; a key here would mean it is in the page source')
})

test('a reading goes stale rather than being trusted forever', () => {
  const now = 1_000_000_000
  assert.equal(isStale(null, now), true)
  assert.equal(isStale({ at: now }, now), false)
  assert.equal(isStale({ at: now - WX_MAX_AGE_MS - 1 }, now), true)
})

test('every line of card copy fits inside the box', () => {
  // The bug this pins actually shipped into a render: a 52-character line in
  // a 50-column interior wrote through the right border and out the other
  // side of the card. Prose is easy to lengthen and the overflow is silent.
  for (const line of [...CONSENT_COPY, ...INSECURE_COPY]) {
    assert.ok(line.length <= CARD_TEXT_W,
      `"${line}" is ${line.length} cols, over the ${CARD_TEXT_W} the card allows`)
  }
})

test('the row-0 short labels fit beside the plate and the clock', () => {
  // Eleven columns between the brand plate and the clock, and the widest
  // temperature reading is "-12C" at four.
  const codes = [0, 1, 2, 3, 45, 48, 51, 56, 61, 66, 71, 80, 85, 95, 96]
  for (const c of codes) {
    const reading = `-12C ${wmoShort(c)}`
    assert.ok(reading.length <= 11, `"${reading}" is ${reading.length} cols, over the 11 on row 0`)
  }
})

test('an insecure origin is not mistaken for a browser without geolocation', () => {
  // Both return false, but for different reasons, and the caller must not
  // record the insecure case as a refusal -- see canLocate()'s note.
  assert.equal(canLocate({ isSecureContext: false, navigator: { geolocation: {} } }), false)
  assert.equal(canLocate({ isSecureContext: true, navigator: {} }), false)
  assert.equal(canLocate({ isSecureContext: true, navigator: { geolocation: {} } }), true)
})

test('precipitation chance is the window peak, and absent is not zero', () => {
  const pops = flat(0)
  for (let h = 12; h <= 17; h++) pops[h] = 10
  pops[15] = 80
  const withPop = bucketHours({ ...day(flat(60), flat(0)), precipitation_probability: pops })
  assert.equal(withPop.find((p) => p.name === 'AFTERNOON').pop, 80,
    'a mean would read ~22 and turn a wet afternoon into a dry-looking one')

  // No field at all is null, NOT 0 -- "no data" and "definitely dry" must
  // not render the same, so the column blanks instead of claiming 0%.
  const noPop = bucketHours(day(flat(60), flat(0)))
  assert.equal(noPop[0].pop, null)
  assert.equal(reducePart([50], [0]).pop, null)
  assert.equal(reducePart([50], [0], [0]).pop, 0, 'an actual zero is still a zero')
})

test('the request asks for the precipitation field it renders', () => {
  // The column silently blanks for every part if this drops out of the URL,
  // which looks like weather with no rain rather than a broken request.
  const u = new URL(forecastUrl(1, 2, 'celsius'))
  assert.match(u.searchParams.get('hourly'), /precipitation_probability/)
  assert.equal(u.searchParams.get('daily'), 'sunrise,sunset')
})
