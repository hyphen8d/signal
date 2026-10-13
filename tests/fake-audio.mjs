// A fake AudioContext, just enough of one to COUNT what gets scheduled
// (2026-10-12, audit M8). The harness has no AudioContext at all, so every
// sound silently no-ops there and nothing about the degauss -- the one sound
// with rules about WHEN it may play -- was reachable from a scenario.
//
// What it models, and why each part matters:
// - `state` starts 'suspended', as a fresh page's context does before any
//   gesture. resume() returns a promise that stays PENDING until unlock(),
//   which is the spec's behaviour and the whole of M8: a resume() asked for
//   at page load resolves at the first unlocking gesture, whatever it is.
//   A resume() on a running context resolves at once.
// - currentTime follows `clock()` (seconds), so the 30s re-arm can be driven
//   off the harness's fake clock.
// - Everything else is a sink: any node, param or method answers, so a
//   sound the fake did not anticipate cannot throw and quietly hide a coil
//   behind sfx.js's try/catch. The coil is recognised by its 78Hz start
//   frequency (scheduleDegauss), and `coils` records each one's start time.
// What it does NOT model: whether a given key is a gesture. Tests call
// unlock() at the point a real browser would unlock -- immediately after the
// first key -- so they assert what the code does with a resume that lands,
// not when Chrome decides it lands.

function node(coils, ctx) {
  const own = {
    connect: (x) => x ?? own.self,
    disconnect() {},
    start() {},
    stop() {},
    frequency: {
      value: 0,
      setValueAtTime(v, t) { if (v === 78) coils.push(t) },
      exponentialRampToValueAtTime() {},
      linearRampToValueAtTime() {},
      setTargetAtTime() {},
      cancelScheduledValues() {},
    },
  }
  const store = {}
  own.self = new Proxy(own, {
    get(t, k) {
      if (k in t) return t[k]
      if (k === 'then') return undefined
      if (!(k in store)) store[k] = sinkObj()
      return store[k]
    },
    set(t, k, v) { t[k] = v; return true },
  })
  return own.self
}

// A sink that is an object with every method a no-op and every property a
// further sink (AudioParam-shaped enough: .value assignable, ramps callable).
function sinkObj() {
  const store = {}
  return new Proxy(function () {}, {
    get(t, k) {
      if (k === 'then') return undefined
      if (k === Symbol.toPrimitive) return () => 0
      if (k === 'value') return store.value ?? 0
      if (!(k in store)) store[k] = sinkObj()
      return store[k]
    },
    set(t, k, v) { store[k] = v; return true },
    apply() { return sinkObj() },
  })
}

export function installFakeAudio({ clock = () => 0 } = {}) {
  const coils = []
  const pending = []
  let state = 'suspended'
  class FakeAudioContext {
    constructor() {
      this.sampleRate = 48000
      this.destination = sinkObj()
    }
    get state() { return state }
    get currentTime() { return clock() }
    resume() {
      if (state === 'running') return Promise.resolve()
      return new Promise((res) => pending.push(res))
    }
    suspend() { return Promise.resolve() }
    createBuffer(ch, n) {
      const data = new Float32Array(Math.max(0, n | 0))
      return { duration: 0, length: n, numberOfChannels: ch, getChannelData: () => data }
    }
    decodeAudioData() { return Promise.reject(new Error('fake')) }
  }
  for (const m of ['createOscillator', 'createGain', 'createBiquadFilter', 'createBufferSource',
    'createDynamicsCompressor', 'createWaveShaper', 'createStereoPanner', 'createConvolver',
    'createDelay', 'createAnalyser', 'createChannelSplitter', 'createChannelMerger',
    'createMediaStreamSource', 'createMediaElementSource']) {
    FakeAudioContext.prototype[m] = function () { return node(coils, this) }
  }
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'AudioContext')
  const prev = globalThis.AudioContext
  globalThis.AudioContext = FakeAudioContext
  return {
    coils,
    get state() { return state },
    /** The first unlocking gesture: the context runs, and every resume()
     *  asked for while it was suspended resolves -- in order, as the spec has
     *  it. Await flush() after this for their .then()s to run. */
    unlock() {
      state = 'running'
      for (const res of pending.splice(0)) res()
    },
    async flush() { for (let i = 0; i < 5; i++) await Promise.resolve() },
    uninstall() {
      if (had) globalThis.AudioContext = prev
      else delete globalThis.AudioContext
    },
  }
}
