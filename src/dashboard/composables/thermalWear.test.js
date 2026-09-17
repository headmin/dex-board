/**
 * Unit tests for the thermal-wear helpers. Plain `node --test`, no Vue.
 * Fixture rows mirror firehose.thermal.host_baselines.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { thermalWear, pearson, median, describeCorrelation, MIN_HOSTS_FOR_CORRELATION } from './thermalWear.js'

const host = (id, over = {}) => ({
  host_id: id, hostname: `${id}.local`, hardware_model: 'Mac17,2', cpu_brand: 'Apple M5', fan_count: 1,
  samples: 100, idle_samples: 60, idle_rpm_median: 2400, rpm_p90: 3000, pct_at_max: 0.02, fan_max_rpm: 6550,
  heatsink_idle_c: 31, temp_max_median_c: 44, battery_cycles: 100, battery_health_pct: 97, battery_health: 'Good',
  first_seen: '2026-09-17 00:00:00', last_seen: '2026-09-17 10:00:00', ...over,
})

test('median and pearson behave, and pearson refuses small samples', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(median([]), null)
  const eight = Array.from({ length: 8 }, (_, i) => [i, 2 * i + 1])
  assert.equal(pearson(eight), 1)
  assert.equal(pearson(eight.slice(0, 7)), null, `under ${MIN_HOSTS_FOR_CORRELATION} pairs is not a correlation`)
  assert.equal(pearson(Array.from({ length: 8 }, (_, i) => [5, i])), null, 'zero variance')
  assert.match(describeCorrelation(null, 3), /needs 8 hosts/)
  assert.match(describeCorrelation(0.75, 20), /strong positive/)
  assert.match(describeCorrelation(-0.05, 20), /no meaningful/)
})

test('thermalWear separates fanless hosts, trusts only well-sampled baselines, flags candidates', () => {
  const rows = [
    host('a'), host('b', { idle_rpm_median: 2500 }), host('c', { idle_rpm_median: 2300 }),
    host('dusty', { idle_rpm_median: 3400, battery_cycles: 700, battery_health_pct: 81 }),   // 1.4× fleet median
    host('maxed', { idle_rpm_median: 2450, pct_at_max: 0.35 }),
    host('thin', { idle_rpm_median: 9000, idle_samples: 3 }),                                 // too few idle samples
    host('air', { fan_count: 0, idle_rpm_median: null, pct_at_max: null, rpm_p90: null }),   // fanless
  ]
  const w = thermalWear(rows)
  assert.equal(w.hostsReporting, 7)
  assert.equal(w.hostsWithFan, 6)
  assert.equal(w.hostsFanless, 1)
  assert.equal(w.hostsBaselined, 5, 'the thin-sample host is not baselined')
  assert.equal(w.fleetIdleRpm, 2450)
  assert.deepEqual(w.candidates.map(c => c.hostId), ['dusty', 'maxed'])
  assert.match(w.candidates[0].reasons[0], /idle fan 39% above fleet median/)
  assert.match(w.candidates[1].reasons[0], /35% of samples at max fan/)
  assert.equal(w.correlations.idleRpmVsCycles.r, null, 'five baselined hosts is below the correlation floor')
  assert.equal(w.correlations.idleRpmVsCycles.n, 5)
})

test('thermalWear reports a correlation once enough hosts have baselines', () => {
  const rows = Array.from({ length: 10 }, (_, i) => host(`h${i}`, { idle_rpm_median: 2000 + i * 100, battery_cycles: 100 + i * 60, battery_health_pct: 99 - i }))
  const w = thermalWear(rows)
  assert.equal(w.correlations.idleRpmVsCycles.r, 1)
  assert.equal(w.correlations.idleRpmVsHealth.r, -1)
  assert.equal(w.correlations.idleRpmVsCycles.n, 10)
})

test('thermalWear on no rows is empty, not broken', () => {
  const w = thermalWear([])
  assert.equal(w.hostsReporting, 0)
  assert.equal(w.fleetIdleRpm, null)
  assert.deepEqual(w.candidates, [])
  assert.equal(w.correlations.idleRpmVsCycles.r, null)
})
