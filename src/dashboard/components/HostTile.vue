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

    <div class="tile-meta">
      <span class="last-seen">Last seen {{ relativeTime(host.last_seen) }}</span>
    </div>

    <div class="tile-actions">
      <button class="tile-action" @click="openInDex" title="Open this host in the DEX Devices view">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 3h12v10H2zM2 6h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        DEX host details
      </button>
      <a class="tile-action primary" :href="openInFleetUrl" target="_blank" rel="noopener noreferrer" title="Open this host in Fleet (new tab)">
        Open in Fleet
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3h7v7M13 3L6 10M10 2H3v11h11v-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useFleetFilter } from '../composables/useFleetFilter'

const props = defineProps({
  host: { type: Object, required: true },
  // Which condition triggered this tile — used to highlight the relevant metric
  condition: { type: String, default: '' },
  // Fleet UI base URL. Defaults to Fleet dogfood; caller may override per-tile
  // or via a wrapping provider to point at prod / internal Fleet instances.
  fleetServerUrl: { type: String, default: 'https://dogfood.fleetdm.com' },
})

const router = useRouter()
const { searchText } = useFleetFilter()

// "DEX host details" routes to /devices with ?hostId=<uuid>. The Devices view
// reads that param on mount and auto-selects the matching row, expanding the
// detail drawer. We also seed searchText so the device list below is filtered
// to the same host, keeping the view visually coherent.
function openInDex() {
  searchText.value = props.host.hostname || props.host.host_id || ''
  router.push({ path: '/devices', query: { hostId: props.host.host_id } })
}

// Fleet deep-link: /hosts/manage/labels/7 is Fleet's "All hosts" label
// context. Fleet's search is a substring match across hostname/serial/UUID,
// so precision matters. Priority:
//   1. hardware_serial — globally unique per Apple device, short, searchable
//   2. host_id (osquery UUID) — globally unique, longer, also indexed by Fleet
//   3. hostname — last-resort fallback (can collide)
const FLEET_ALL_HOSTS_LABEL_ID = 7
const openInFleetUrl = computed(() => {
  const q = props.host.hardware_serial || props.host.host_id || props.host.hostname || ''
  const params = new URLSearchParams({
    query: q,
    page: '0',
    order_key: 'display_name',
    order_direction: 'asc',
  })
  return `${props.fleetServerUrl}/hosts/manage/labels/${FLEET_ALL_HOSTS_LABEL_ID}?${params.toString()}`
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
  padding: 16px 18px 12px;
  color: var(--fleet-black);
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
  box-shadow: var(--box-shadow);
  /* Equal-height tiles in the grid — actions stay pinned to the bottom
     regardless of how long hostnames/metrics are. */
  height: 100%;
  min-height: 200px;
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

/* Meta row (last seen, etc.) sits just above the actions. Push it to the
   bottom of the tile with margin-top: auto so equal-height tiles align. */
.tile-meta {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-top: 10px;
  border-top: 1px solid var(--fleet-black-5);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  margin-top: auto;
}

.last-seen {
  white-space: nowrap;
}

/* Actions row gets its own strip — consistent layout per tile regardless
   of hostname / last-seen text length. */
.tile-actions {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.tile-action {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 8px;
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 600;
  color: var(--fleet-black-75);
  background: transparent;
  border: 1px solid var(--fleet-black-10);
  cursor: pointer;
  text-decoration: none;
  transition: all 150ms ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile-action:hover {
  background: var(--fleet-black-5);
  color: var(--fleet-black);
  border-color: var(--fleet-black-25);
}

.tile-action svg {
  flex-shrink: 0;
}

/* Primary action gets the Fleet vibrant-blue accent to stand out in the row */
.tile-action.primary {
  background: rgba(106, 103, 254, 0.08);
  border-color: rgba(106, 103, 254, 0.25);
  color: var(--fleet-vibrant-blue);
}

.tile-action.primary:hover {
  background: rgba(106, 103, 254, 0.15);
  border-color: var(--fleet-vibrant-blue);
}
</style>
