<template>
  <div class="bar-list">
    <div v-for="row in rows" :key="row.name" class="bar-list__row" :title="`${row.label}: ${row.value}`">
      <span class="bar-list__label">{{ row.label }}</span>
      <div class="bar-list__track">
        <div class="bar-list__fill" :style="{ width: row.pct + '%', background: color }"></div>
      </div>
      <span class="bar-list__value">{{ row.value.toLocaleString() }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { humanizeToken } from '../../composables/humanize'

/**
 * Sorted label + bar + count rows — replaces donut charts for CATEGORICAL
 * share data (RAM tiers, versions, platforms). The Score-breakdown row
 * pattern, applied to counts.
 */
const props = defineProps({
  data: { type: Array, default: () => [] },
  nameKey: { type: String, default: 'name' },
  valueKey: { type: String, default: 'value' },
  /** Chart-identity accent (data series, not status). */
  color: { type: String, default: 'var(--fleet-vibrant-blue)' },
  maxRows: { type: Number, default: 0 },
  humanize: { type: Boolean, default: true },
})

const rows = computed(() => {
  let list = props.data
    .map(r => ({ name: String(r[props.nameKey] ?? ''), value: Number(r[props.valueKey]) || 0 }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value)
  if (props.maxRows > 0) list = list.slice(0, props.maxRows)
  const max = list[0]?.value || 1
  return list.map(r => ({
    ...r,
    label: props.humanize ? humanizeToken(r.name) : r.name,
    pct: Math.max(2, (r.value / max) * 100),
  }))
})
</script>

<style scoped>
.bar-list { display: flex; flex-direction: column; gap: 10px; }

.bar-list__row { display: flex; align-items: center; gap: 12px; }

.bar-list__label {
  min-width: 110px;
  max-width: 180px;
  flex-shrink: 0;
  font-size: var(--font-size-md);
  color: var(--fleet-black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-list__track {
  flex: 1;
  height: var(--bar-height);
  background: var(--fleet-black-10);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.bar-list__fill { height: 100%; border-radius: var(--radius-full); transition: width 400ms ease-out; }

.bar-list__value {
  min-width: 40px;
  text-align: right;
  font-size: var(--font-size-md);
  color: var(--fleet-black-75);
  font-variant-numeric: tabular-nums;
}
</style>
