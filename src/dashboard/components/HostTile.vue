<template>
  <div class="host-tile">
    <div class="tile-header">
      <div class="tile-avatar" :style="avatarStyle">
        {{ avatarLetter }}
      </div>
      <div class="tile-title">
        <div class="tile-name" :title="displayHost(host)">{{ displayHost(host) }}</div>
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
      <button class="tile-action" @click="openInDex" title="Open this host in Fleet">
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
import { displayHost } from '../composables/displayName'
import { useAppConfig } from '../composables/useAppConfig'

const props = defineProps({
  host: { type: Object, required: true },
  // Which condition triggered this tile — used to highlight the relevant metric
  condition: { type: String, default: '' },
  // Optional per-tile override. Normally the Fleet base URL comes from the
  // worker config (FLEET_URL secret) via useAppConfig; pass this prop only
  // to point a specific tile at a different Fleet instance.
  fleetServerUrl: { type: String, default: '' },
})

const router = useRouter()
const { searchText } = useFleetFilter()
const { config } = useAppConfig()
const fleetBase = computed(() => props.fleetServerUrl || config.value.fleetUrl)

// "DEX host details" routes to /devices with ?hostId=<uuid>. The Devices view
// reads that param on mount and auto-selects the matching row, expanding the
// detail drawer. We also seed searchText so the device list below is filtered
// to the same host, keeping the view visually coherent.
function openInDex() {
  searchText.value = displayHost(props.host) || props.host.host_id || ''
  router.push(`/hosts/${props.host.host_id}`)
}

// Fleet deep-link: /hosts/manage?query=<host UUID>. The UUID is globally
// unique and indexed by Fleet's host search, so the link resolves to exactly
// this host; serial/hostname are only fallbacks when no UUID is present.
const openInFleetUrl = computed(() => {
  const q = props.host.host_id || props.host.hardware_serial || props.host.hostname || ''
  return `${fleetBase.value}/hosts/manage?query=${encodeURIComponent(q)}`
})

// First letter of hostname drives both avatar letter and a deterministic color
// from a small palette, so each host is visually distinguishable at a glance.
const avatarLetter = computed(() =>
  (displayHost(props.host) || '?').charAt(0).toUpperCase()
)

// Deterministic per-first-letter identity palette — saturated enough to read
// on white, muted enough not to shout. Identity colors, not status: kept as
// literal hexes in one const (amber gets dark text for contrast).
const AVATAR_PALETTE = [
  { bg: '#5cabdf', fg: '#ffffff' }, // blue
  { bg: '#009a7d', fg: '#ffffff' }, // green
  { bg: '#ecc767', fg: '#3a2e00' }, // amber
  { bg: '#9b6bd9', fg: '#ffffff' }, // purple
  { bg: '#e07b6b', fg: '#ffffff' }, // coral
  { bg: '#515774', fg: '#ffffff' }, // slate
]

const avatarStyle = computed(() => {
  const char = avatarLetter.value.charCodeAt(0) || 65
  const c = AVATAR_PALETTE[char % AVATAR_PALETTE.length]
  return { backgroundColor: c.bg, color: c.fg }
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
    case 'degraded_os':
    case 'acceptable_os':
    case 'healthy_os':
      return 'OS health'
    case 'uptime_risk_stale':
      return 'Uptime'
    case 'vpn_disconnected':
      return 'Network'
    case 'has_crashes':
      return 'Crashes (7d)'
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
    case 'degraded_os':
    case 'acceptable_os':
    case 'healthy_os':
      return props.host.dex_os_health || '—'
    case 'uptime_risk_stale':
      return props.host.uptime_days != null ? `${props.host.uptime_days}d` : '—'
    case 'vpn_disconnected':
      return props.host.network_confidence || '—'
    case 'has_crashes':
      return props.host.total_crashes_7d ?? '—'
    default:
      return '—'
  }
})

const primaryClass = computed(() => {
  const v = String(primaryValue.value).toLowerCase()
  if (['severe', 'replace', 'high', 'disconnected', 'degraded'].includes(v)) return 'state-critical'
  if (['elevated', 'moderate', 'acceptable'].includes(v)) return 'state-warn'
  // Numeric crash count: any crashes = warning, many = critical
  if (props.condition === 'has_crashes') {
    const n = Number(props.host.total_crashes_7d) || 0
    if (n >= 5) return 'state-critical'
    if (n >= 1) return 'state-warn'
  }
  // Stale uptime gets a warn color
  if (props.condition === 'uptime_risk_stale') return 'state-warn'
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
  border-radius: var(--radius-large);
  padding: var(--pad-medium) var(--pad-medium) var(--pad-smedium);
  color: var(--fleet-black);
  display: flex;
  flex-direction: column;
  gap: 13px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
  box-shadow: var(--box-shadow);
  /* Equal-height tiles in the grid — actions stay pinned to the bottom
     regardless of how long hostnames/metrics are. */
  height: 100%;
  min-height: 200px;
}

.host-tile:hover {
  border-color: var(--fleet-black-25);
  box-shadow: var(--shadow-md);
}

.tile-header {
  display: flex;
  align-items: center;
  gap: 11px;
}

.tile-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}

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
  gap: 11px;
}

.metric-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-label {
  font-size: 12px;
  color: var(--fleet-black-75);
  font-weight: 500;
}

.metric-value {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric-value.state-critical {
  color: var(--fleet-error);
}

.metric-value.state-warn {
  color: var(--fleet-ui-orange);
}

/* Meta row (last seen, etc.) sits just above the actions. Push it to the
   bottom of the tile with margin-top: auto so equal-height tiles align. */
.tile-meta {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-top: 9px;
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
  gap: 5px;
}

.tile-action {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 7px;
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: 10px;
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

/* Primary action gets the Fleet brand-green accent to stand out in the row */
.tile-action.primary {
  background: var(--fleet-accent-green-light);
  border-color: var(--status-good-bg);
  color: var(--fleet-green);
}

.tile-action.primary:hover {
  background: var(--status-good-bg);
  border-color: var(--fleet-green);
  color: var(--fleet-green-over);
}
</style>
