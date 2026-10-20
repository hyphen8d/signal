// tools/test-quick.mjs's mapping (2026-10-20). The quick loop is only as
// good as its guess about reach, and its one dangerous failure is quiet: a
// file that should force the full suite getting a small subset instead.
// So the escalations are pinned here alongside the narrow mappings.
//
// Run: node --test tests/

import test from 'node:test'
import assert from 'node:assert/strict'
import { mapFile } from '../tools/test-quick.mjs'

test('test:quick maps effects, tests and tools to their own tests', () => {
  assert.deepEqual(mapFile('visuals/frost.js').tests, ['tests/visual-frost.test.mjs', 'tests/visuals.test.mjs', 'tests/lazy-raster.test.mjs'])
  assert.deepEqual(mapFile('tests/game.test.mjs').tests, ['tests/game.test.mjs'])
  assert.ok(mapFile('stations.js').tests.includes('tests/roster.test.mjs'))
  assert.ok(mapFile('tools/lib/roster.mjs').tests.includes('tests/roster-lib.test.mjs'))
  // The boundary: lib/roster.mjs must not pull in every test that names
  // check-roster.mjs, and vice versa.
  assert.ok(!mapFile('tools/lib/roster.mjs').tests.includes('tests/health-wiring.test.mjs'))
  assert.ok(mapFile('tools/check-roster.mjs').tests.includes('tests/health-wiring.test.mjs'))
  assert.deepEqual(mapFile('CLAUDE.md').tests, [])
})

test('test:quick falls back to the full suite for anything every boot imports', () => {
  for (const f of ['program.js', 'config.js', 'src/term.js', 'ui/desktop.js', 'audio/voice.js', 'visualizer.js', 'visuals/index.js', 'visuals/shared.js', 'tests/harness.mjs', 'index.html']) {
    assert.equal(mapFile(f).tests, 'ALL', `${f} must force the full suite`)
  }
})
