// audio/voice.js -- the one voice channel.
//
// A station ID, a liner drop and the network sign-on all go through
// playProcessedVoiceClip, and a real station has one announcer. Before
// 2026-08-30 nothing held a handle on a clip once it had started, so two
// could overlap: tryLock() fires a station ID 500ms after a lock and the
// clip runs ~2.4s, and a second preset pressed inside that window put a
// second voice over the first. Every existing guard passed, because they
// only stop a clip that has NOT started yet. Reported from real listening.
//
// On the fake below, and CLAUDE.md's warning about fakes: what is asserted
// here is this module's OWN bookkeeping -- did the second call stop the
// first one's nodes -- not any claim about how WebAudio behaves. The fake
// only has to record calls faithfully for that to mean something. Node has
// no AudioContext at all, and playProcessedVoiceClip takes ctx as an
// argument precisely so it can be driven from outside.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const tag = 'voice-clip-test'
globalThis.SIGNAL_BUILD ??= tag
globalThis.matchMedia ??= () => ({ matches: false })
const { playProcessedVoiceClip, _liveVoiceForTest } =
  await import(`../audio/voice.js?v=${globalThis.SIGNAL_BUILD}`)

const param = () => ({
  value: 1,
  setValueAtTime() { return this },
  exponentialRampToValueAtTime() { return this },
  linearRampToValueAtTime() { return this },
  cancelScheduledValues() { return this },
  cancelAndHoldAtTime() { return this },
  connect() { return this },
})

function fakeCtx() {
  const sources = []
  const node = (extra = {}) => ({ connect(next) { return next }, ...extra })
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    destination: node(),
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ frequency: param(), Q: param(), gain: param() }),
    createWaveShaper: () => node({}),
    createDelay: () => node({ delayTime: param() }),
    createOscillator: () => {
      const o = node({ frequency: param(), stops: [], start() {}, stop(t) { this.stops.push(t) } })
      sources.push(o); return o
    },
    createBufferSource: () => {
      const s = node({ stops: [], start() {}, stop(t) { this.stops.push(t) }, onended: null })
      sources.push(s); return s
    },
    createBuffer: (_c, n) => ({ getChannelData: () => new Float32Array(n) }),
  }
  return { ctx, sources }
}

const buffer = { duration: 2.4 }
const lastStop = (s) => s.stops[s.stops.length - 1]

test('a second voice clip cuts the one already playing', () => {
  const { ctx, sources } = fakeCtx()
  playProcessedVoiceClip(buffer, ctx, ctx.currentTime)
  const first = sources.slice()
  assert.ok(first.length >= 3, 'speech, hiss and the wobble LFO all start')
  // Everything is scheduled to stop at its natural end, ~2.45s out.
  for (const s of first) assert.ok(lastStop(s) > 2.4, 'scheduled to run to the end')

  // Preset pressed 0.9s in -- inside the clip, which is the real case.
  ctx.currentTime = 0.9
  playProcessedVoiceClip(buffer, ctx, ctx.currentTime)

  for (const s of first) {
    assert.ok(lastStop(s) < 1.1,
      `a node from the first clip is still scheduled to ${lastStop(s)}s -- it should have been cut just after 0.9s`)
    assert.ok(lastStop(s) > 0.9, 'and cut with a short fade, not stopped dead on the sample')
  }
  // The replacement is left alone.
  for (const s of sources.slice(first.length)) assert.ok(lastStop(s) > 3.2, 'the new clip runs its full length')
})

test('a clip that ends on its own leaves nothing to cut', () => {
  const { ctx, sources } = fakeCtx()
  playProcessedVoiceClip(buffer, ctx, ctx.currentTime)
  assert.ok(_liveVoiceForTest(), 'a playing clip is held')
  sources.find((s) => s.onended).onended()
  assert.equal(_liveVoiceForTest(), null, 'and released when it finishes')
})

test("a cut clip's late onended cannot release the clip that replaced it", () => {
  // The ordering that makes this necessary: cutLiveVoice() schedules the old
  // source to stop, the new clip registers itself, and only THEN does the old
  // source's onended fire. Without the identity check that late callback
  // clears the handle for a clip that is still playing, and the next voice
  // has nothing to cut -- the original bug back again, one step removed.
  const { ctx, sources } = fakeCtx()
  playProcessedVoiceClip(buffer, ctx, ctx.currentTime)
  const stale = sources.find((s) => s.onended)
  ctx.currentTime = 0.9
  playProcessedVoiceClip(buffer, ctx, ctx.currentTime)
  const live = _liveVoiceForTest()
  stale.onended()
  assert.equal(_liveVoiceForTest(), live, 'the newer clip is still the live one')
})
