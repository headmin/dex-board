/**
 * Unit tests for chip tier resolution.
 *
 * Runs on plain `node --test` like pseudonyms.test.js — no Vue, no DOM.
 * The brand strings below are verbatim osquery system_info.cpu_brand values.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chipSpec,
  chipLabel,
  chipSortKey,
  chipDistribution,
  chipRollup,
  CHIP_TIERS,
} from './chipTier.js'

test('resolves every Apple tier from cpu_brand', () => {
  const cases = [
    ['Apple M1',       { family: 'M1', tier: 'base',  label: 'M1',       year: 2020 }],
    ['Apple M1 Pro',   { family: 'M1', tier: 'pro',   label: 'M1 Pro',   year: 2021 }],
    ['Apple M1 Max',   { family: 'M1', tier: 'max',   label: 'M1 Max',   year: 2021 }],
    ['Apple M1 Ultra', { family: 'M1', tier: 'ultra', label: 'M1 Ultra', year: 2022 }],
    ['Apple M2',       { family: 'M2', tier: 'base',  label: 'M2',       year: 2022 }],
    ['Apple M2 Max',   { family: 'M2', tier: 'max',   label: 'M2 Max',   year: 2023 }],
    ['Apple M3 Ultra', { family: 'M3', tier: 'ultra', label: 'M3 Ultra', year: 2025 }],
    ['Apple M4 Pro',   { family: 'M4', tier: 'pro',   label: 'M4 Pro',   year: 2024 }],
    ['Apple M5',       { family: 'M5', tier: 'base',  label: 'M5',       year: 2025 }],
  ]
  for (const [brand, want] of cases) {
    const spec = chipSpec(brand, 'apple_m1')
    assert.equal(spec.vendor, 'apple', brand)
    assert.equal(spec.family, want.family, brand)
    assert.equal(spec.tier, want.tier, brand)
    assert.equal(spec.label, want.label, brand)
    assert.equal(spec.year, want.year, brand)
    assert.equal(spec.source, 'cpu_brand', brand)
    assert.equal(spec.exact, true, brand)
  }
})

test('cpu_brand wins over a disagreeing cpu_class', () => {
  // The whole point: the enum says "apple_m1", the brand says M1 Max.
  const spec = chipSpec('Apple M1 Max', 'apple_m1')
  assert.equal(spec.tier, 'max')
  assert.equal(spec.key, 'apple_m1_max')
})

test('cpu_class fallback reports generation but NEVER invents a tier', () => {
  const spec = chipSpec('', 'apple_m2')
  assert.equal(spec.family, 'M2')
  assert.equal(spec.tier, null, 'unknown tier must stay null, not default to base')
  assert.equal(spec.tierRank, null)
  assert.equal(spec.source, 'cpu_class')
  assert.equal(spec.exact, false)
  // Its bucket must be distinct from the resolved base-M2 bucket, so a chart
  // cannot silently merge "unknown" into "base".
  assert.notEqual(spec.key, chipSpec('Apple M2', null).key)
  assert.equal(spec.key, 'apple_m2_unknown')
  // The plain label degrades to the generation — same as the old cpu_class
  // label, and correct in a table cell. Only the chart bucket disambiguates.
  assert.equal(spec.label, 'M2')
  assert.equal(spec.bucketLabel, 'M2 (unknown)', 'a chart bucket must not read as base M2')
  // Age still falls back to the base-chip date so the host is not un-aged.
  assert.equal(spec.year, 2022)
})

test('tier refines age within a generation', () => {
  // The concrete payoff: an M1 Max is a 2021 machine. Ageing it off the base
  // M1 date (2020) overstates its age by a year.
  assert.equal(chipSpec('Apple M1', null).year, 2020)
  assert.equal(chipSpec('Apple M1 Max', null).year, 2021)
  assert.equal(chipSpec('Apple M1 Ultra', null).year, 2022)
})

test('parses Intel brand strings and the intel enum', () => {
  const fromBrand = chipSpec('Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz', null)
  assert.equal(fromBrand.vendor, 'intel')
  assert.equal(fromBrand.family, 'i7')
  assert.equal(fromBrand.tier, null)
  assert.equal(fromBrand.exact, false, 'Intel has no tier axis — never claim exact')

  const fromEnum = chipSpec('', 'intel_i5')
  assert.equal(fromEnum.vendor, 'intel')
  assert.equal(fromEnum.family, 'i5')

  // Xeon / unrecognised Intel still resolves as Intel rather than null.
  const xeon = chipSpec('Intel(R) Xeon(R) W-2140B CPU @ 3.20GHz', null)
  assert.equal(xeon.vendor, 'intel')
  assert.equal(xeon.family, 'Intel')
})

test('returns null for genuinely unknown input', () => {
  for (const [brand, cls] of [[null, null], ['', ''], [undefined, undefined], ['Snapdragon X', 'arm64']]) {
    assert.equal(chipSpec(brand, cls), null, `${brand} / ${cls}`)
  }
  assert.equal(chipLabel('', ''), null)
})

test('sort key orders the fleet oldest/weakest to newest/strongest', () => {
  const order = [
    'Intel(R) Core(TM) i5-8259U CPU @ 2.30GHz',
    'Apple M1', 'Apple M1 Pro', 'Apple M1 Max', 'Apple M1 Ultra',
    'Apple M2', 'Apple M2 Max', 'Apple M4 Pro', 'Apple M5',
  ]
  const keys = order.map(b => chipSortKey(chipSpec(b, null)))
  for (let i = 1; i < keys.length; i++) {
    assert.ok(keys[i] > keys[i - 1], `${order[i]} must sort after ${order[i - 1]}`)
  }
  // A tier-unknown M1 must not appear to outrank a resolved M1 Max.
  assert.ok(chipSortKey(chipSpec('', 'apple_m1')) < chipSortKey(chipSpec('Apple M1 Max', null)))
  assert.equal(chipSortKey(null), -1000)
})

test('chipDistribution splits a generation into its tiers', () => {
  const rows = [
    { cpu_brand: 'Apple M1 Max', cpu_class: 'apple_m1' },
    { cpu_brand: 'Apple M1 Max', cpu_class: 'apple_m1' },
    { cpu_brand: 'Apple M1',     cpu_class: 'apple_m1' },
    { cpu_brand: 'Apple M2 Pro', cpu_class: 'apple_m2' },
    { cpu_brand: '',             cpu_class: 'apple_m2' },  // tier unknown
    { cpu_brand: null,           cpu_class: null },        // unresolvable — dropped
  ]
  const dist = chipDistribution(rows)
  const byKey = Object.fromEntries(dist.map(d => [d.key, d]))
  assert.equal(byKey['apple_m2_unknown'].label, 'M2 (unknown)')
  assert.equal(byKey['apple_m1_max'].label, 'M1 Max')

  assert.equal(byKey['apple_m1_base'].device_count, 1, 'base M1 counted alone')
  assert.equal(byKey['apple_m1_max'].device_count, 2)
  assert.equal(byKey['apple_m2_pro'].device_count, 1)
  assert.equal(byKey['apple_m2_unknown'].device_count, 1, 'unknown-tier M2 in its own bucket')
  assert.equal(dist.reduce((s, d) => s + d.device_count, 0), 5, 'unresolvable row dropped, not bucketed')

  // Buckets resolved from cpu_class alone are flagged so the UI can mark them.
  assert.equal(byKey['apple_m1_max'].exact, true)
  assert.equal(byKey['apple_m2_unknown'].exact, false)

  // Fleet age order.
  assert.deepEqual(dist.map(d => d.key),
    ['apple_m1_base', 'apple_m1_max', 'apple_m2_unknown', 'apple_m2_pro'])
})

test('chipDistribution handles empty and missing input', () => {
  assert.deepEqual(chipDistribution([]), [])
  assert.deepEqual(chipDistribution(null), [])
  assert.deepEqual(chipDistribution(undefined), [])
})

test('tier vocabulary is ordered weakest to strongest', () => {
  assert.deepEqual(CHIP_TIERS, ['base', 'pro', 'max', 'ultra'])
  const ranks = CHIP_TIERS.map(t => chipSpec(`Apple M2 ${t === 'base' ? '' : t}`.trim(), null).tierRank)
  assert.deepEqual(ranks, [0, 1, 2, 3])
})

test('chipDistribution accepts SQL-grouped rows via countKey', () => {
  // Shape of firehose.health.chip_distribution: brand+class already grouped.
  const rows = [
    { cpu_brand: 'Apple M1 Max', cpu_class: 'apple_m1', device_count: '12' },
    { cpu_brand: 'Apple M1',     cpu_class: 'apple_m1', device_count: '30' },
    { cpu_brand: '',             cpu_class: 'apple_m1', device_count: '4' },
    { cpu_brand: 'Apple M3 Pro', cpu_class: 'apple_m3', device_count: 7 },
  ]
  const dist = chipDistribution(rows, { countKey: 'device_count' })
  const byKey = Object.fromEntries(dist.map(d => [d.key, d]))
  assert.equal(byKey['apple_m1_max'].device_count, 12)
  assert.equal(byKey['apple_m1_base'].device_count, 30)
  assert.equal(byKey['apple_m1_unknown'].device_count, 4)
  assert.equal(byKey['apple_m3_pro'].device_count, 7)
  assert.equal(dist.reduce((s, d) => s + d.device_count, 0), 53, 'counts, not row counts')
  // Same brand arriving under two class values must still merge.
  const merged = chipDistribution([
    { cpu_brand: 'Apple M2', cpu_class: 'apple_m2', device_count: 3 },
    { cpu_brand: 'Apple M2', cpu_class: '',         device_count: 2 },
  ], { countKey: 'device_count' })
  assert.equal(merged.length, 1)
  assert.equal(merged[0].device_count, 5)
})

test('chipRollup merges buckets with weighted means, not averages of averages', () => {
  // Same chip reached two ways: 30 hosts resolved from the brand string, 2
  // more that only had cpu_class. A plain mean would score these 50/50.
  const rows = [
    { cpu_brand: 'Apple M4 Pro', cpu_class: 'apple_m4', device_count: 30, measured_hosts: 30, avg_health_pct: 97, avg_cycles: 80, max_cycles: 261 },
    { cpu_brand: 'Apple M4 Pro', cpu_class: 'apple_m4', device_count: 2,  measured_hosts: 2,  avg_health_pct: 87, avg_cycles: 40, max_cycles: 90 },
  ]
  const [b] = chipRollup(rows, {
    sums: ['measured_hosts'],
    means: { avg_health_pct: 'measured_hosts', avg_cycles: 'device_count' },
    maxes: ['max_cycles'],
  })
  assert.equal(b.label, 'M4 Pro')
  assert.equal(b.device_count, 32)
  assert.equal(b.measured_hosts, 32)
  assert.equal(b.max_cycles, 261)
  // (97*30 + 87*2) / 32 = 96.375 -> 96.4, NOT (97+87)/2 = 92
  assert.equal(b.avg_health_pct, 96.4)
  assert.equal(b.avg_cycles, 77.5)
})

test('chipRollup keeps an entirely unmeasured bucket null, never 0', () => {
  // Every host is a desktop / failed read: no capacity was measured. Zero is
  // a capacity claim we cannot support; null is the honest answer.
  const rows = [
    { cpu_brand: 'Apple M4', cpu_class: 'apple_m4', device_count: 3, measured_hosts: 0, avg_health_pct: 0 },
  ]
  const [b] = chipRollup(rows, {
    sums: ['measured_hosts'],
    means: { avg_health_pct: 'measured_hosts' },
  })
  assert.equal(b.device_count, 3)
  assert.equal(b.measured_hosts, 0)
  assert.equal(b.avg_health_pct, null)
})

test('chipRollup separates tiers and orders them oldest to newest', () => {
  const rows = [
    { cpu_brand: 'Apple M5',     cpu_class: 'apple_m5', device_count: 9, measured_hosts: 9, avg_cycles: 31 },
    { cpu_brand: 'Apple M1 Pro', cpu_class: 'apple_m1', device_count: 4, measured_hosts: 4, avg_cycles: 294 },
    { cpu_brand: 'Apple M1',     cpu_class: 'apple_m1', device_count: 2, measured_hosts: 2, avg_cycles: 143 },
  ]
  const out = chipRollup(rows, { sums: ['measured_hosts'], means: { avg_cycles: 'measured_hosts' } })
  assert.deepEqual(out.map(b => b.label), ['M1', 'M1 Pro', 'M5'])
  assert.equal(out.length, 3, 'M1 and M1 Pro must not merge')
})

test('chipRollup marks a bucket inexact when any row fell back to cpu_class', () => {
  const rows = [
    { cpu_brand: 'Apple M2', cpu_class: 'apple_m2', device_count: 3, measured_hosts: 3 },
    { cpu_brand: '',         cpu_class: 'apple_m2', device_count: 1, measured_hosts: 1 },
  ]
  const out = chipRollup(rows, { sums: ['measured_hosts'] })
  // The brand-resolved M2 bucket and the class-only bucket are DIFFERENT
  // buckets -- 'unknown' tier must not be folded into the base chip.
  assert.equal(out.length, 2)
  assert.deepEqual(out.map(b => b.label).sort(), ['M2', 'M2 (unknown)'])
  assert.equal(out.find(b => b.label === 'M2 (unknown)').exact, false)
})
