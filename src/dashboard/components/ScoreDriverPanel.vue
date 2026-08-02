<template>
  <div class="driver-panel" :class="{ 'is-primary': isPrimary }">
    <div class="driver-header">
      <div class="driver-title">
        <span class="driver-cat">{{ category.label }}</span>
        <span v-if="isPrimary" class="driver-primary-pill">primary driver</span>
      </div>
      <div class="driver-totals">
        <span class="driver-prev mono">{{ category.prev ?? '—' }}</span>
        <span class="driver-arrow">→</span>
        <span class="driver-curr mono">{{ category.curr ?? '—' }}</span>
        <span class="driver-delta" :class="deltaClass(category.delta)">
          {{ formatDelta(category.delta) }}
        </span>
      </div>
    </div>
    <table class="signal-table">
      <tbody>
        <tr
          v-for="s in category.signals"
          :key="s.key"
          :class="{ 'signal-driver': s.is_driver, 'signal-static': s.static, 'signal-unchanged': s.unchanged }"
        >
          <td class="signal-label">{{ s.label }}</td>
          <td class="signal-value mono">
            <span>{{ formatVal(s.prev_display, s.prev) }}</span>
            <span class="ver-arrow">→</span>
            <span>{{ formatVal(s.curr_display, s.curr) }}</span>
          </td>
          <td class="signal-contribution">
            <template v-if="s.static">
              <span class="muted">static</span>
            </template>
            <template v-else-if="s.contribution === null">
              <span class="muted">—</span>
            </template>
            <template v-else-if="s.unchanged">
              <span class="muted">unchanged</span>
            </template>
            <template v-else>
              <span :class="deltaClass(s.contribution)">
                drove {{ formatDelta(s.contribution) }}
              </span>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
defineProps({
  category: { type: Object, required: true },
  isPrimary: { type: Boolean, default: false },
})

function formatVal(displayVal, rawVal) {
  if (displayVal !== null && displayVal !== undefined && displayVal !== '') return displayVal
  if (rawVal === null || rawVal === undefined || rawVal === '') return '—'
  return rawVal
}

function deltaClass(n) {
  if (n === null || n === undefined) return ''
  if (n > 0) return 'delta-up'
  if (n < 0) return 'delta-down'
  return ''
}

function formatDelta(n) {
  if (n === null || n === undefined) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}`
}
</script>

<style scoped>
.driver-panel {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: 12px 14px;
  margin-bottom: 10px;
}
.driver-panel.is-primary {
  border-color: var(--fleet-black-25);
  background: var(--fleet-off-white);
}
.driver-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--fleet-black-5);
  flex-wrap: wrap;
}
.driver-title { display: flex; align-items: center; gap: 8px; }
.driver-cat { font-weight: 700; font-size: var(--font-size-sm); color: var(--fleet-black); }
.driver-primary-pill { font-size: 11px; font-weight: 600;
  padding: 2px 10px; border-radius: var(--radius-full);
  background: var(--fleet-black-10); color: var(--fleet-black-75);
}
.driver-totals { display: flex; align-items: baseline; gap: 6px; font-size: var(--font-size-sm); }
.driver-prev, .driver-curr { color: var(--fleet-black); }
.driver-curr { font-weight: 600; }
.driver-arrow { color: var(--fleet-black-50); }
.driver-delta { margin-left: 6px; font-weight: 700; }
.delta-up   { color: var(--fleet-status-success); }
.delta-down { color: var(--fleet-status-error); }

.signal-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); }
.signal-table td { padding: 6px 8px; border-bottom: 1px solid var(--fleet-black-5); color: var(--fleet-black-75); }
.signal-table tr:last-child td { border-bottom: none; }
.signal-table .signal-label { width: 38%; color: var(--fleet-black); }
.signal-table .signal-value { width: 35%; font-size: var(--font-size-xs); white-space: nowrap; }
.signal-table .signal-value .ver-arrow { margin: 0 6px; color: var(--fleet-black-50); }
.signal-table .signal-contribution { width: 27%; text-align: right; font-size: var(--font-size-xs); }
.signal-table .muted { color: var(--fleet-black-50); }
.signal-driver td { background: var(--fleet-black-5); }
.signal-driver .signal-label::after {
  content: 'driver';
  margin-left: 6px;
  font-size: 10px; font-weight: 600;
  background: var(--fleet-black-10); color: var(--fleet-black-75);
  padding: 1px 8px; border-radius: var(--radius-full);
}
.signal-static td, .signal-unchanged td { color: var(--fleet-black-50); }
.mono { font-family: var(--font-mono); }
</style>
