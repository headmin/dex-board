<template>
  <!-- ─── Answer — the exec briefing hero (design 1a) ─────────── -->
  <section class="answer-hero">
    <div class="hero-composite">
      <span class="hero-eyebrow">Fleet composite</span>
      <div class="hero-grade-row">
        <span class="hero-grade" :style="{ color: gradeColor(fleet.grade) }" title="Grades: A ≥ 90 · B ≥ 75 · C ≥ 60 · D ≥ 40 · F below 40">{{ fleet.grade }}</span>
        <span class="hero-score">{{ fleet.score != null ? fleet.score : '—' }}<span class="hero-score-max">/100</span></span>
      </div>
      <span v-if="compositeDelta != null" class="hero-delta" :class="compositeDelta >= 0 ? 'hero-delta--up' : 'hero-delta--down'">
        {{ compositeDelta >= 0 ? '▲' : '▼' }} {{ Math.abs(compositeDelta).toFixed(1) }} pts vs {{ deltaLabel }}
      </span>
      <!-- 30-day composite trend — the "C to B this quarter" line leadership
           reports. Recessive mark: the grade stays the hero, the sparkline
           is context. -->
      <svg
        v-if="sparkline"
        class="hero-sparkline"
        :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`"
        role="img"
        :aria-label="sparkline.label"
      >
        <title>{{ sparkline.label }}</title>
        <polyline
          v-for="(seg, i) in sparkline.segments"
          :key="i"
          :points="seg"
          fill="none"
          stroke="var(--fleet-black-33)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle :cx="sparkline.end.x" :cy="sparkline.end.y" r="2.5" fill="var(--fleet-white)" />
      </svg>
      <span v-if="sparkline" class="hero-spark-caption">{{ sparkline.caption }}</span>
      <span v-if="fleet.deviceCount" class="hero-hosts">{{ fleet.deviceCount }} hosts scored</span>
      <!-- Coverage disclosure: the score's base table is macOS-fed, so hosts
           seen in other telemetry but not scored must not read as covered.
           Coverage numbers are fleet-wide (unfiltered) by design. -->
      <span v-if="coverageGap" class="hero-coverage">
        {{ coverage.scored_hosts }} of {{ coverage.known_hosts }} hosts seen this week are scored — macOS scoring only
      </span>
    </div>

    <div class="hero-narrative">
      <p class="hero-headline">
        {{ leadClause }}<template v-if="draggingCategory">, but
        <span class="hl-fair">{{ draggingCategory.label.toLowerCase() }}</span> is dragging the score</template><template v-if="exposureClause">
        and <span :class="exposureClause.cls">{{ exposureClause.text }}</span></template>.
      </p>
      <p v-if="supportLine" class="hero-support">{{ supportLine }}</p>
    </div>

    <div class="hero-moved">
      <span class="hero-eyebrow">What moved — {{ deltaLabel }}</span>
      <div v-if="topMovers.length" class="hero-moved-list">
        <div v-for="m in topMovers" :key="m.key" class="hero-moved-row">
          <span class="hero-moved-label">{{ m.label }}</span>
          <span class="hero-moved-delta" :class="m.delta >= 0 ? 'hero-delta--up-text' : 'hero-delta--down-text'">{{ m.delta >= 0 ? '+' : '−' }}{{ Math.abs(m.delta).toFixed(1) }}</span>
        </div>
      </div>
      <span v-else class="hero-moved-empty">No category moved in this window</span>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { gradeColor } from '../../composables/gradeColors'

const props = defineProps({
  fleet: { type: Object, default: () => ({ grade: '—', score: null, deviceCount: 0 }) },
  tileDeltas: { type: Object, default: () => ({}) },
  categories: { type: Array, default: () => [] },
  exposureView: { type: Object, default: () => ({ available: false }) },
  exposureDays: { type: Number, default: 90 },
  deltaLabel: { type: String, default: 'window start' },
  distribution: { type: Object, default: () => ({}) },
  deviceList: { type: Array, default: () => [] },
  /** { scored_hosts, known_hosts } from firehose.scores.coverage (7d, fleet-wide). */
  coverage: { type: Object, default: () => ({}) },
})

const coverageGap = computed(() => {
  const scored = Number(props.coverage?.scored_hosts)
  const known = Number(props.coverage?.known_hosts)
  return Number.isFinite(scored) && Number.isFinite(known) && known > scored
})

// ─── 30-day sparkline geometry ────────────────────────────────
// fleet.sparkline is oldest → newest with nulls for missing days; nulls
// break the line into segments rather than being interpolated over.
const SPARK_W = 132
const SPARK_H = 30
const sparkline = computed(() => {
  const values = props.fleet?.sparkline || []
  const real = values.filter(v => v != null)
  if (real.length < 2) return null
  const min = Math.min(...real)
  const max = Math.max(...real)
  const span = max - min || 1
  const pad = 3
  const x = (i) => pad + (i / (values.length - 1)) * (SPARK_W - 2 * pad)
  const y = (v) => pad + (1 - (v - min) / span) * (SPARK_H - 2 * pad)

  const segments = []
  let current = []
  values.forEach((v, i) => {
    if (v == null) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
      return
    }
    current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  })
  if (current.length > 1) segments.push(current.join(' '))
  if (!segments.length) return null

  let endIdx = values.length - 1
  while (endIdx >= 0 && values[endIdx] == null) endIdx--
  const first = real[0]
  const last = values[endIdx]
  return {
    segments,
    end: { x: x(endIdx), y: y(last) },
    caption: '30 days',
    label: `Composite score over the last 30 days: from ${Math.round(first)} to ${Math.round(last)} (${real.length} of ${values.length} days measured)`,
  }
})

const compositeDelta = computed(() => {
  const d = props.tileDeltas?.composite
  return d == null ? null : Number(d)
})

// A trend is only claimed when a comparison actually exists; with no delta
// the sentence states the standing instead of asserting stability.
const leadClause = computed(() => {
  const d = compositeDelta.value
  if (d == null) {
    return props.fleet.score != null
      ? `The fleet stands at ${props.fleet.grade} ${props.fleet.score}/100`
      : 'The fleet has no composite score yet'
  }
  if (d >= 1) return 'The fleet is improving'
  if (d <= -1) return 'The fleet is slipping'
  return 'The fleet is stable'
})

// The composite category with the lowest current score (network is context
// only and never "drags" the composite).
const draggingCategory = computed(() => {
  const scored = props.categories.filter(c => c.key !== 'network' && c.score != null)
  if (!scored.length) return null
  const worst = scored.reduce((a, b) => (b.score < a.score ? b : a))
  // Only call it a drag if it's meaningfully below the composite.
  if (props.fleet.score != null && worst.score >= props.fleet.score) return null
  return worst
})

// Endpoint-exposure clause, reusing the security time-travel diff. Higher
// security score = less exposed, so dir 'worse' means exposure worsened.
const exposureClause = computed(() => {
  const v = props.exposureView
  if (!v?.available || !v.delta) return null
  const pts = Math.abs(v.delta)
  if (v.dir === 'worse') return { cls: 'hl-critical', text: `endpoint exposure has worsened ${pts} pts since ${props.exposureDays} days ago` }
  if (v.dir === 'better') return { cls: 'hl-good', text: `endpoint exposure improved ${pts} pts over ${props.exposureDays} days` }
  return null
})

// Supporting line: every number computed from live data — no copywriting.
const supportLine = computed(() => {
  const d = Number(props.distribution?.D || 0)
  const f = Number(props.distribution?.F || 0)
  const low = d + f
  if (!low) return null
  let line = `${low} host${low === 1 ? ' sits' : 's sit'} at D or F`
  const lowHosts = props.deviceList.filter(h => h.composite_grade === 'D' || h.composite_grade === 'F')
  if (lowHosts.length >= 3) {
    const smallRam = lowHosts.filter(h => ['8gb', '16gb'].includes(String(h.ram_tier || '').toLowerCase())).length
    const pct = Math.round((smallRam / lowHosts.length) * 100)
    if (pct >= 50) line += ` — ${pct}% of them run 16 GB of RAM or less`
  }
  const drag = draggingCategory.value
  if (drag) line += `. Lifting ${drag.label.toLowerCase()} on those hosts returns the fastest composite points.`
  else line += '.'
  return line
})

// Top 3 category deltas by magnitude for the "what moved" rail.
const topMovers = computed(() =>
  props.categories
    .map(c => ({ key: c.key, label: c.label, delta: props.tileDeltas?.[c.key] }))
    .filter(m => m.delta != null && Number(m.delta) !== 0)
    .map(m => ({ ...m, delta: Number(m.delta) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
)
</script>

<style scoped>
.answer-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-xlarge) 32px;
  display: grid;
  grid-template-columns: 280px 1fr 300px;
  gap: 40px;
  align-items: center;
  color: var(--fleet-white);
}

.hero-eyebrow {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black-50);
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.hero-composite {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hero-grade-row {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.hero-grade {
  font-size: 72px;
  font-weight: 700;
  line-height: 0.9;
}

.hero-score {
  font-size: 36px;
  font-weight: 600;
  line-height: 1;
}

.hero-score-max {
  font-size: 16px;
  color: var(--fleet-black-50);
  font-weight: 500;
}

.hero-delta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 3px 9px;
  border-radius: var(--radius);
  font-size: var(--font-size-sm);
  font-weight: 600;
}
.hero-delta--up { background: rgba(0, 154, 125, 0.18); color: var(--status-good-soft); }
.hero-delta--down { background: rgba(235, 67, 67, 0.18); color: #ff9a9a; }

.hero-hosts {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
}

.hero-sparkline {
  width: 132px;
  height: 30px;
  margin-top: 4px;
}
.hero-spark-caption {
  font-size: var(--font-size-xxsmall);
  color: var(--fleet-black-50);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hero-coverage {
  font-size: var(--font-size-xxsmall);
  color: var(--status-fair);
  max-width: 24ch;
  text-wrap: pretty;
}

.hero-narrative {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-left: 1px solid var(--fleet-blue);
  padding-left: 40px;
}

.hero-headline {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;
  text-wrap: pretty;
}

.hl-fair { color: var(--status-fair); }
.hl-critical { color: #ff9a9a; }
.hl-good { color: var(--status-good-soft); }

.hero-support {
  margin: 0;
  font-size: var(--font-size-base);
  line-height: 1.6;
  color: var(--fleet-black-33);
  text-wrap: pretty;
}

.hero-moved {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hero-moved-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hero-moved-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-medium);
}

.hero-moved-label { font-size: var(--font-size-base); }

.hero-moved-delta {
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
  font-weight: 700;
}
.hero-delta--up-text { color: var(--status-good-soft); }
.hero-delta--down-text { color: #ff9a9a; }

.hero-moved-empty {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  font-style: italic;
}

@media (max-width: 1100px) {
  .answer-hero { grid-template-columns: 1fr; gap: 20px; }
  .hero-narrative { border-left: none; padding-left: 0; }
}
</style>
