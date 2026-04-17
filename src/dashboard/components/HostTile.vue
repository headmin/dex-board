<template>
  <div class="host-tile">
    <div class="tile-header">
      <div class="tile-avatar" :class="`platform-${avatarColor}`">
        {{ avatarLetter }}
      </div>
      <div class="tile-title">
        <div class="tile-name" :title="host.hostname">{{ host.hostname || host.host_id?.slice(0, 12) }}</div>
        <div class="tile-sub">{{ host.cpu_class || host.cpu_brand || '—' }}</div>
      </div>
    </div>

    <div class="tile-metrics">
      <div class="metric-cell">
        <div class="metric-label">{{ primaryLabel }}</div>
        <div class="metric-value" :class="primaryClass">{{ primaryValue }}</div>
      </div>
      <div class="metric-cell">
        <div class="metric-label">RAM</div>
        <div class="metric-value">{{ host.ram_gb ? `${host.ram_gb} GB` : '—' }}</div>
      </div>
      <div class="metric-cell">
        <div class="metric-label">Battery</div>
        <div class="metric-value">{{ host.battery_percent ?? '—' }}{{ host.battery_percent != null ? '%' : '' }}</div>
      </div>
    </div>

    <div class="tile-footer">
      <span class="last-seen">Last seen {{ relativeTime(host.last_seen) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  host: { type: Object, required: true },
  // Which condition triggered this tile — used to highlight the relevant metric
  condition: { type: String, default: '' },
})

// First letter of hostname drives both avatar letter and a deterministic color
// from a small palette, so each host is visually distinguishable at a glance.
const avatarLetter = computed(() =>
  (props.host.hostname || props.host.host_id || '?').charAt(0).toUpperCase()
)

const avatarColor = computed(() => {
  const char = avatarLetter.value.charCodeAt(0) || 65
  const palette = ['a', 'b', 'c', 'd', 'e', 'f']
  return palette[char % palette.length]
})

// The "primary" metric is whatever condition the user drilled into.
// Renders prominently in the first metric cell; other cells stay fixed.
const primaryLabel = computed(() => {
  switch (props.condition) {
    case 'severe_swap':
    case 'elevated_swap':
      return 'Swap'
    case 'degraded_battery':
    case 'replace_battery':
      return 'Battery health'
    case 'high_compression':
      return 'Compression'
    default:
      return 'Status'
  }
})

const primaryValue = computed(() => {
  switch (props.condition) {
    case 'severe_swap':
    case 'elevated_swap':
      return props.host.swap_pressure || '—'
    case 'degraded_battery':
    case 'replace_battery':
      return props.host.battery_health_score || '—'
    case 'high_compression':
      return props.host.compression_pressure || '—'
    default:
      return '—'
  }
})

const primaryClass = computed(() => {
  const v = String(primaryValue.value).toLowerCase()
  if (['severe', 'replace', 'high'].includes(v)) return 'state-critical'
  if (['elevated', 'degraded', 'moderate'].includes(v)) return 'state-warn'
  return ''
})

function relativeTime(ts) {
  if (!ts) return 'unknown'
  const d = new Date(ts)
  const diffMs = Date.now() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
</script>

<style scoped>
.host-tile {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: 16px 18px;
  color: var(--fleet-black);
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
  box-shadow: var(--box-shadow);
}

.host-tile:hover {
  border-color: var(--fleet-vibrant-blue, #4a90d9);
  box-shadow: 0 2px 8px rgba(106, 103, 254, 0.08);
}

.tile-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tile-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  color: #fff;
  flex-shrink: 0;
}

/* Deterministic per-first-letter palette — saturated enough to read on white,
   muted enough not to shout. Matches Fleet's existing accent palette. */
.platform-a { background: #4a90d9; }  /* blue */
.platform-b { background: #3db67b; }  /* green */
.platform-c { background: #ebbc43; color: #3a2e00; }  /* amber — dark text for contrast */
.platform-d { background: #9b6bd9; }  /* purple */
.platform-e { background: #e07b6b; }  /* coral */
.platform-f { background: #515774; }  /* slate */

.tile-title {
  min-width: 0;
  flex: 1;
}

.tile-name {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile-sub {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.metric-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-label {
  font-size: 11px;
  color: var(--fleet-black-50);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 600;
}

.metric-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric-value.state-critical {
  color: var(--fleet-error, #d66c7b);
}

.metric-value.state-warn {
  color: #b05c1a;
}

.tile-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--fleet-black-5);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}
</style>
