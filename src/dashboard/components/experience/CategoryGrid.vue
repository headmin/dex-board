<template>
  <!-- ─── Why — category cards (design 1a briefing style) ────── -->
  <section class="category-cards">
    <button
      v-for="cat in categories"
      :key="cat.key"
      type="button"
      class="cat-card"
      :class="{
        'cat-card--expanded': expandedCategory === cat.key,
        'cat-card--context': cat.key === 'network',
      }"
      :title="cat.key === 'network' ? 'Network quality is shown for context but excluded from the composite score: Wi-Fi signal is too volatile for a number that drives quarterly decisions.' : `Expand ${cat.label} signals`"
      @click="$emit('toggle', cat.key)"
    >
      <div class="cat-head">
        <span class="cat-label">{{ cat.label }}</span>
        <span v-if="deltaOf(cat.key) != null" class="cat-delta" :class="deltaClass(cat.key)">{{ deltaText(cat.key) }}</span>
      </div>
      <div class="cat-grade-row">
        <span class="cat-grade" :style="{ color: cat.key === 'network' ? 'var(--fleet-black-50)' : gradeColor(cat.grade) }">{{ cat.grade }}</span>
        <span class="cat-score">{{ cat.score != null ? cat.score : '—' }}</span>
      </div>
      <div class="cat-meter">
        <div
          class="cat-meter-fill"
          :style="{ width: (cat.score || 0) + '%', background: cat.key === 'network' ? 'var(--fleet-black-33)' : gradeColor(cat.grade) }"
        ></div>
      </div>
      <span class="cat-caption" :class="{ 'cat-caption--active': expandedCategory === cat.key }">
        {{ captionFor(cat) }}
      </span>
    </button>
  </section>
</template>

<script setup>
import { gradeColor } from '../../composables/gradeColors'

// Composite weights — mirrors core-scores.ts (the canonical scoring source):
// 0.25*DH + 0.35*Perf + 0.20*Sec + 0.20*SW; network is informational.
const WEIGHTS = { device_health: 25, performance: 35, security: 20, software: 20 }

const props = defineProps({
  categories: { type: Array, default: () => [] },
  tileDeltas: { type: Object, default: () => ({}) },
  expandedCategory: { type: String, default: null },
  loading: { type: Boolean, default: false },
})

defineEmits(['toggle'])

function deltaOf(key) {
  const d = props.tileDeltas?.[key]
  return d == null ? null : Number(d)
}

function deltaText(key) {
  const d = deltaOf(key)
  if (d == null) return ''
  if (d === 0) return '0.0'
  return `${d > 0 ? '▲' : '▼'}${Math.abs(d).toFixed(1)}`
}

function deltaClass(key) {
  const d = deltaOf(key)
  if (d == null || d === 0) return 'cat-delta--flat'
  return d > 0 ? 'cat-delta--up' : 'cat-delta--down'
}

function captionFor(cat) {
  if (cat.key === 'network') return 'Context only — not scored'
  const w = WEIGHTS[cat.key]
  const base = w ? `${w}% of composite` : ''
  return props.expandedCategory === cat.key ? `${base} · expanded` : base
}
</script>

<style scoped>
.category-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--pad-smedium);
}

.cat-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-body);
  transition: border-color var(--transition-base), box-shadow var(--transition-base);
}
.cat-card:hover { border-color: var(--fleet-black-25); }
.cat-card:focus-visible {
  outline: 1px solid var(--fleet-focused-outline);
  outline-offset: 1px;
}

/* Expanded card: 2px ink border, padding compensated so nothing shifts */
.cat-card--expanded {
  border: 2px solid var(--fleet-black);
  padding: 15px;
}
.cat-card--expanded .cat-label { font-weight: 700; }

/* Network: dashed, greyed — context only */
.cat-card--context {
  background: var(--fleet-black-5);
  border-style: dashed;
  border-color: var(--fleet-black-25);
}
.cat-card--context .cat-label { color: var(--fleet-black-75); }
.cat-card--context .cat-score { color: var(--fleet-black-75); }
.cat-card--context .cat-meter { background: var(--fleet-black-10); }

.cat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cat-label {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--fleet-black);
}

.cat-delta {
  font-family: var(--font-mono);
  font-size: var(--font-size-xxsmall);
  font-weight: 700;
}
.cat-delta--up { color: var(--status-good); }
.cat-delta--down { color: var(--status-critical); }
.cat-delta--flat { color: var(--fleet-black-50); }

.cat-grade-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.cat-grade {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}

.cat-score {
  font-size: 18px;
  font-weight: 600;
  color: var(--fleet-black);
}

.cat-meter {
  height: 6px;
  background: var(--fleet-black-5);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.cat-meter-fill {
  height: 100%;
  transition: width 400ms ease-out;
}

.cat-caption {
  font-size: var(--font-size-xxsmall);
  color: var(--fleet-black-50);
}
.cat-caption--active {
  color: var(--fleet-black);
  font-weight: 600;
}

@media (max-width: 1024px) {
  .category-cards { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 640px) {
  .category-cards { grid-template-columns: repeat(2, 1fr); }
}
</style>
