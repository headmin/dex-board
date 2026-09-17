/**
 * Unit tests for the age-compressed time scale.
 * Plain `node --test` like the other composable tests — no Vue, no DOM.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timeScale, ageInDays, labelForDays, projectSeries } from './logTime.js'

const DAY = 86400000
const NOW = new Date('2026-09-06T12:00:00Z').getTime()

test('ageInDays measures backwards from now and never goes negative', () => {
  assert.equal(ageInDays(new Date(NOW), NOW), 0)
  assert.equal(ageInDays(new Date(NOW - 7 * DAY), NOW), 7)
  // A future timestamp (clock skew on a host) clamps to now rather than
  // landing off the right edge of the axis.
  assert.equal(ageInDays(new Date(NOW + 5 * DAY), NOW), 0)
  assert.equal(ageInDays('not a date', NOW), null)
})

test('log scale anchors both ends exactly', () => {
  const s = timeScale(123)
  assert.equal(s.toX(0), 1, 'now sits on the right edge')
  assert.equal(s.toX(123), 0, 'oldest sits on the left edge')
  // Out-of-range input clamps instead of escaping the plot.
  assert.equal(s.toX(-10), 1)
  assert.equal(s.toX(9999), 0)
})

test('recent days get far more width than old ones — the whole point', () => {
  const s = timeScale(365)
  const lastWeek = s.toX(0) - s.toX(7)          // width of the most recent week
  const weekAYearAgo = s.toX(358) - s.toX(365)  // width of a week, a year back
  assert.ok(lastWeek > weekAYearAgo * 20,
    `recent week (${lastWeek}) should dwarf an old week (${weekAYearAgo})`)
  // Sanity: on a linear axis those two weeks are identical.
  const lin = timeScale(365, 'linear')
  assert.ok(Math.abs((lin.toX(0) - lin.toX(7)) - (lin.toX(358) - lin.toX(365))) < 1e-12)
})

test('time still flows left to right — only spacing changes', () => {
  const s = timeScale(180)
  const xs = [180, 90, 30, 7, 1, 0].map(s.toX)
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] > xs[i - 1], 'older points must sit left of newer ones')
  }
})

test('toAge round-trips toX in both modes', () => {
  for (const mode of ['log', 'linear']) {
    const s = timeScale(200, mode)
    for (const age of [0, 1, 7, 30, 99, 200]) {
      assert.ok(Math.abs(s.toAge(s.toX(age)) - age) < 1e-6, `${mode} @ ${age}d`)
    }
  }
})

test('ticks stay inside the range and always anchor the left edge', () => {
  const s = timeScale(45)
  const t = s.ticks()
  assert.ok(t.every(x => x.days <= 45), 'no tick beyond the history we have')
  assert.ok(t.every(x => x.x >= 0 && x.x <= 1))
  assert.equal(t[0].x, 0, 'leftmost tick pins the oldest edge')
  assert.deepEqual(t.map(x => x.label).slice(-3), ['3d', '1d', 'now'])
  // 45 days is between the 30d and 60d rungs, so the edge gets its own label.
  assert.ok(t.some(x => x.days === 45))
})

test('labelForDays picks a human unit', () => {
  assert.equal(labelForDays(0), 'now')
  assert.equal(labelForDays(5), '5d')
  assert.equal(labelForDays(21), '3w')
  assert.equal(labelForDays(90), '3mo')
  assert.equal(labelForDays(365), '1y')
  assert.equal(labelForDays(548), '1.5y')
})

test('projectSeries drops unusable rows rather than coercing them to zero', () => {
  const s = timeScale(30)
  const rows = [
    { score_date: new Date(NOW - 1 * DAY), composite: 82 },
    { score_date: new Date(NOW - 10 * DAY), composite: null },   // not measured
    { score_date: new Date(NOW - 15 * DAY), composite: 79 },
    { score_date: new Date(NOW - 400 * DAY), composite: 60 },    // outside range
    { score_date: 'garbage', composite: 50 },
  ]
  const out = projectSeries(rows, { scale: s, now: NOW })
  assert.equal(out.length, 2, 'null, out-of-range and unparseable rows are dropped')
  assert.deepEqual(out.map(p => p.y), [79, 82], 'oldest first, left to right')
  assert.ok(out[0].x < out[1].x)
})

test('projectSeries handles empty and missing input', () => {
  const s = timeScale(30)
  assert.deepEqual(projectSeries([], { scale: s }), [])
  assert.deepEqual(projectSeries(null, { scale: s }), [])
  assert.throws(() => projectSeries([], {}), /needs a scale/)
})
