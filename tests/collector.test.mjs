// The collector, driven through its real fetch() against an in-memory KV.
//
// This exists because there is no other way to exercise it without a
// Cloudflare account and live traffic, and the first run of it found a bug
// that would have been a 500 on the only route that matters: a 204 is a
// "null body status" in the Fetch spec, so `new Response('', {status:204})`
// throws. Unit-testing sanitise() alone would never have seen it -- the
// failure was in the plumbing around the validation, not in the validation.
import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../tools/collector/worker.js'

/** Just enough of a KV namespace, and a window onto what was actually
 *  stored -- which is the other thing worth asserting. */
function fakeKV() {
  const store = new Map()
  return {
    store,
    ns: {
      async get(k, type) {
        const v = store.get(k)
        return v === undefined ? null : (type === 'json' ? JSON.parse(v) : v)
      },
      async put(k, v) { store.set(k, v) },
    },
  }
}
const envFor = (kv) => ({ READ_TOKEN: 'tok', SIGNAL_STATS: kv.ns })
const visit = (o) => ({ s: 1, v: 'b1', mode: 'desktop', mins: 30, stations: {}, used: [], ...o })
let ip = 0
const post = (env, body) => worker.fetch(new Request('https://c/collect', {
  method: 'POST',
  body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { 'CF-Connecting-IP': `203.0.113.${++ip % 250}` },
}), env)
const stats = (env, auth = 'Bearer tok') => worker.fetch(
  new Request('https://c/stats?days=7', { headers: { Authorization: auth } }), env)

test('a summary is accepted and answered with a bodyless 204', async () => {
  const kv = fakeKV()
  const res = await post(envFor(kv), visit({ stations: { 'cold-wave': 25 }, used: ['scan'] }))
  assert.equal(res.status, 204)
  assert.equal(res.body, null, 'a 204 must carry no body')
})

test('summaries fold into one day of counters, and the records themselves are dropped', async () => {
  const kv = fakeKV()
  const env = envFor(kv)
  await post(env, visit({ stations: { 'cold-wave': 25 }, used: ['scan'] }))
  await post(env, visit({ stations: { 'cold-wave': 10, cipher: 20 }, used: ['scan', 'visualizer'], consent: { tap: 'no' } }))
  await post(env, visit({ mode: 'mobile', mins: 5, stations: { atomic: 4 }, used: ['guide'], failures: 2 }))

  const day = (await stats(env)).ok && (await (await stats(env)).json()).days[0]
  assert.equal(day.sessions, 3)
  assert.equal(day.minutes, 65)
  assert.equal(day.failures, 2)
  assert.deepEqual(day.stations, { 'cold-wave': 35, cipher: 20, atomic: 4 })
  assert.deepEqual(day.features, { scan: 2, visualizer: 1, guide: 1 })
  assert.deepEqual(day.modes, { desktop: 2, mobile: 1 })
  assert.deepEqual(day.consent, { tap: { yes: 0, no: 1 } })

  // The property the whole design rests on: there is no per-visit row here
  // to leak, subpoena, or join against anything.
  const kept = [...kv.store.keys()].filter((k) => !k.startsWith('day:') && !k.startsWith('rl:'))
  assert.deepEqual(kept, [], 'the collector must retain no raw visit records')
  assert.equal([...kv.store.keys()].filter((k) => k.startsWith('day:')).length, 1)
})

test('junk is refused without ever reaching storage', async () => {
  const kv = fakeKV()
  const env = envFor(kv)
  assert.equal((await post(env, '{{{not json')).status, 400)
  assert.equal((await post(env, visit({ s: 99 }))).status, 204, 'a wrong schema version is dropped silently')
  assert.equal((await post(env, { s: 1 })).status, 204, 'no mins is not a summary')
  assert.equal([...kv.store.keys()].filter((k) => k.startsWith('day:')).length, 0,
    'nothing invalid may create a day key')
})

test('an oversized body is refused before it is parsed', async () => {
  const kv = fakeKV()
  const res = await post(envFor(kv), 'x'.repeat(5000))
  assert.equal(res.status, 413)
})

test('/stats is the only route that returns anything, and it needs the token', async () => {
  const kv = fakeKV()
  const env = envFor(kv)
  assert.equal((await stats(env, '')).status, 401)
  assert.equal((await stats(env, 'Bearer wrong')).status, 401)
  assert.equal((await stats(env)).status, 200)
  assert.equal((await worker.fetch(new Request('https://c/nope'), env)).status, 404)
  // No token configured at all must not become an open door.
  const naked = { SIGNAL_STATS: kv.ns }
  assert.equal((await stats(naked)).status, 401)
})

test('one address cannot post without limit', async () => {
  const kv = fakeKV()
  const env = envFor(kv)
  const one = () => worker.fetch(new Request('https://c/collect', {
    method: 'POST', body: JSON.stringify(visit({ stations: { atomic: 5 } })),
    headers: { 'CF-Connecting-IP': '198.51.100.7' },
  }), env)
  let limited = 0
  for (let i = 0; i < 30; i++) if ((await one()).status === 429) limited++
  assert.ok(limited > 0, 'a flood from one address must eventually be refused')
})
