<template>
  <div class="dist-strip">
    <div class="dist-strip__bar" role="img" :aria-label="ariaLabel">
      <div
        v-for="seg in segments"
        :key="seg.name"
        class="dist-strip__seg"
        :style="{ width: seg.pct + '%', background: seg.color }"
        :title="`${seg.label}: ${seg.value}`"
      ></div>
    </div>
    <div class="dist-strip__legend">
      <span v-for="seg in segments" :key="seg.name" class="dist-strip__item">
        <span class="dist-strip__dot" :style="{ background: seg.color }"></span>
        <span class="dist-strip__label">{{ seg.label }}</span>
        <span class="dist-strip__count">{{ seg.value }}</span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { humanizeToken } from '../../composables/humanize'
import { TONE_SOLID, BAR_TONES } from '../../composables/statusTones'

/**
 * Ordered distribution strip — replaces donut charts for ORDERED
 * severity/tier distributions. Segments render in the given `order`
 * (best -> worst), colored via `tones` on the canonical status scale.
 */
const props = defineProps({
  data: { type: Array, default: () => [] },
  nameKey: { type: String, default: 'name' },
  valueKey: { type: String, default: 'value' },
  /** Segment order, best -> worst. Names not listed sort after, by value. */
  order: { type: Array, default: () => [] },
  /** name -> tone; solid-fill vocabulary (BAR_TONES — includes 'soft') */
  tones: {
    type: Object,
    default: () => ({}),
    validator: obj => Object.values(obj).every(t => BAR_TONES.includes(t)),
  },
  humanize: { type: Boolean, default: true },
})

const segments = computed(() => {
  const rows = props.data
    .map(r => ({ name: String(r[props.nameKey] ?? ''), value: Number(r[props.valueKey]) || 0 }))
    .filter(r => r.value > 0)
  const total = rows.reduce((s, r) => s + r.value, 0) || 1
  const rank = (n) => {
    const i = props.order.indexOf(n)
    return i === -1 ? props.order.length : i
  }
  rows.sort((a, b) => rank(a.name) - rank(b.name) || b.value - a.value)
  return rows.map(r => ({
    ...r,
    label: props.humanize ? humanizeToken(r.name, { capitalize: false }) : r.name,
    pct: Math.max(1.5, (r.value / total) * 100),
    color: TONE_SOLID[props.tones[r.name]] || TONE_SOLID.neutral,
  }))
})

const ariaLabel = computed(() =>
  segments.value.map(s => `${s.label} ${s.value}`).join(', ')
)
</script>

<style scoped>
.dist-strip { display: flex; flex-direction: column; gap: 10px; }

.dist-strip__bar {
  display: flex;
  height: var(--gauge-track-height);
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--fleet-black-5);
}
.dist-strip__seg { height: 100%; min-width: 3px; }

.dist-strip__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}
.dist-strip__item { display: inline-flex; align-items: baseline; gap: 5px; font-size: var(--font-size-sm); }
.dist-strip__dot { width: 8px; height: 8px; border-radius: 50%; align-self: center; flex-shrink: 0; }
.dist-strip__label { color: var(--fleet-black-75); }
.dist-strip__count { color: var(--fleet-black); font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
