<template>
  <!-- ─── Answer — the exec briefing hero (design 1a) ─────────── -->
  <section class="answer-hero">
    <div class="hero-composite">
      <span class="hero-eyebrow">Fleet composite</span>
      <div class="hero-grade-row">
        <span class="hero-grade" :style="{ color: gradeColor(fleet.grade) }">{{ fleet.grade }}</span>
        <span class="hero-score">{{ fleet.score != null ? fleet.score : '—' }}<span class="hero-score-max">/100</span></span>
      </div>
      <span v-if="compositeDelta != null" class="hero-delta" :class="compositeDelta >= 0 ? 'hero-delta--up' : 'hero-delta--down'">
        {{ compositeDelta >= 0 ? '▲' : '▼' }} {{ Math.abs(compositeDelta).toFixed(1) }} pts vs {{ deltaLabel }}
      </span>
      <span v-if="fleet.deviceCount" class="hero-hosts">{{ fleet.deviceCount }} hosts scored</span>
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
