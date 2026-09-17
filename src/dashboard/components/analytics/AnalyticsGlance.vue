<template>
  <div class="glance">
    <div class="glance-head">
      <h2 class="glance-title">What the telemetry says</h2>
      <span class="glance-hint">One number per domain · click a card for the full detail</span>
    </div>

    <div class="glance-grid">
      <button
        v-for="d in domains"
        :key="d.card"
        class="glance-card"
        :class="`glance-card--${d.tone}`"
        type="button"
        @click="$emit('open', d.tab)"
        :title="`Open ${d.label} in expert mode`"
      >
        <span class="glance-label">{{ d.label }}</span>
        <span class="glance-value" :class="{ 'glance-value--none': d.value == null }">
          {{ d.value == null ? '—' : d.value }}<span v-if="d.unit" class="glance-unit">{{ d.unit }}</span>
        </span>
        <span class="glance-sub">{{ d.sub }}</span>
      </button>
    </div>

    <p class="glance-foot">
      Counts only — no domain here carries a grade, because only five of them
      feed the composite and inventing a letter for the rest would imply a
      scoring rule that does not exist. Open a card for the charts behind it.
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { query } from '../../services/api'
import { useFleetFilter } from '../../composables/useFleetFilter'

defineEmits(['open'])

const { filterParams } = useFleetFilter()
const queryParams = computed(() => ({ ...filterParams.value }))
const s = ref({})          // domain key -> summary row

/**
 * One card per Analytics tab, each showing the single most actionable number
 * that domain already publishes on its own tab. Nothing here is computed or
 * scored — the glance RELOCATES numbers that previously required visiting ten
 * tabs to see. That is deliberate: a summary screen that derived its own
 * judgements would be a second scoring system competing with the composite.
 *
 * Tone is applied only where the underlying value is already a defect count —
 * a host in severe swap, a disconnected host, a crashing host, an unencrypted
 * disk. Domains whose headline is a neutral inventory figure (hardware,
 * applications, Wi-Fi averages) stay neutral rather than being given a
 * threshold this codebase has never defined for them.
 */
const domains = computed(() => {
  const g = (k) => s.value[k] || {}
  const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

  const health = g('health'), os = g('os'), vpn = g('vpn'), crash = g('crashes')
  const sec = g('security'), adopt = g('adoption'), wifi = g('wifi')
  const apps = g('apps'), hw = g('hardware'), fleetd = g('fleetd')

  const severe = n(health.severe_swap)
  const disconnected = n(vpn.disconnected)
  const crashing = n(crash.devices_with_crashes)
  const degradedOs = n(os.degraded)
  // posture_summary reports counts, not a rate. Derived here rather than
  // read off a field that does not exist -- and left null when no host
  // reported posture at all, so an empty domain cannot render as 0%.
  const postureHosts = n(sec.posture_hosts)
  const encPct = postureHosts && postureHosts > 0
    ? Math.round((n(sec.disk_encrypted_count) ?? 0) / postureHosts * 100)
    : null
  const neverOpened = n(adopt.never_opened)
  const versions = n(fleetd.unique_versions)

  return [
    {
      card: 'health', tab: 'health', label: 'Host health',
      value: severe, unit: severe != null ? ' hosts' : '',
      sub: severe != null ? `in severe swap${n(health.total_devices) ? ` of ${n(health.total_devices)}` : ''}` : 'no data',
      tone: severe == null ? 'none' : severe > 0 ? 'critical' : 'good',
    },
    {
      card: 'security', tab: 'security', label: 'Security',
      value: encPct, unit: encPct != null ? '%' : '',
      sub: encPct != null ? `disks encrypted of ${postureHosts} reporting` : 'no data',
      tone: encPct == null ? 'none' : encPct >= 100 ? 'good' : 'fair',
    },
    {
      card: 'crashes', tab: 'crashes', label: 'Crashes',
      value: crashing, unit: crashing != null ? ' hosts' : '',
      sub: crashing != null ? 'crashed in the last 7 days' : 'no data',
      tone: crashing == null ? 'none' : crashing > 0 ? 'critical' : 'good',
    },
    {
      card: 'os', tab: 'health', label: 'OS health',
      value: degradedOs, unit: degradedOs != null ? ' hosts' : '',
      sub: degradedOs != null ? 'on a degraded OS' : 'no data',
      tone: degradedOs == null ? 'none' : degradedOs > 0 ? 'fair' : 'good',
    },
    {
      card: 'vpn', tab: 'vpn', label: 'Connectivity',
      value: disconnected, unit: disconnected != null ? ' hosts' : '',
      sub: disconnected != null ? 'disconnected from the network' : 'no data',
      tone: disconnected == null ? 'none' : disconnected > 0 ? 'critical' : 'good',
    },
    {
      card: 'adoption', tab: 'adoption', label: 'Adoption',
      value: neverOpened, unit: neverOpened != null ? ' apps' : '',
      sub: neverOpened != null ? 'installed but never opened' : 'no data',
      tone: neverOpened == null ? 'none' : neverOpened > 0 ? 'fair' : 'good',
    },
    {
      card: 'fleetd', tab: 'fleetd', label: 'Fleet agent',
      value: versions, unit: versions != null ? ' versions' : '',
      sub: versions != null
        ? `across ${n(fleetd.enrolled_hosts) ?? '—'} enrolled hosts`
        : 'no data',
      // More than one agent version in a fleet is drift, not a defect count.
      tone: versions == null ? 'none' : versions > 1 ? 'fair' : 'good',
    },
    {
      card: 'wifi', tab: 'wifi', label: 'Wi-Fi',
      value: n(wifi.avg_rssi), unit: n(wifi.avg_rssi) != null ? ' dBm' : '',
      sub: n(wifi.avg_rssi) != null ? `average signal across ${n(wifi.unique_hosts) ?? '—'} hosts` : 'no data',
      tone: 'neutral',
    },
    {
      card: 'apps', tab: 'apps', label: 'Applications',
      value: n(apps.unique_apps), unit: '',
      sub: n(apps.unique_apps) != null ? `distinct apps on ${n(apps.unique_hosts) ?? '—'} hosts` : 'no data',
      tone: 'neutral',
    },
    {
      card: 'hardware', tab: 'hardware', label: 'Hardware',
      value: n(hw.device_count), unit: n(hw.device_count) != null ? ' hosts' : '',
      sub: n(hw.model_count) != null ? `across ${n(hw.model_count)} models` : 'no data',
      tone: 'neutral',
    },
  ]
})

async function load() {
  const p = { ...queryParams.value }
  const jobs = {
    health: ['firehose.health.device_summary', p],
    os: ['firehose.health.os_summary', p],
    vpn: ['firehose.vpn.summary', p],
    crashes: ['firehose.crashes.summary', p],
    security: ['firehose.security.posture_summary', p],
    adoption: ['firehose.adoption.summary', p],
    wifi: ['firehose.wifi.summary', {}],
    apps: ['firehose.apps.fleet_summary', {}],
    hardware: ['firehose.hardware.summary', {}],
    fleetd: ['firehose.fleetd.summary', p],
  }
  // allSettled, not all: one dead domain must leave the other nine readable
  // and show "no data" for itself rather than blanking the screen.
  const keys = Object.keys(jobs)
  const res = await Promise.allSettled(keys.map(k => query(jobs[k][0], jobs[k][1])))
  const next = {}
  res.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`Glance: ${jobs[keys[i]][0]} failed`, r.reason)
    next[keys[i]] = r.status === 'fulfilled' ? (r.value?.[0] ?? {}) : {}
  })
  s.value = next
}

onMounted(load)
watch(queryParams, load, { deep: true })
</script>

<style scoped>
.glance-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--pad-medium);
  gap: 12px;
}
.glance-title { font-size: var(--card-title-size); font-weight: 700; color: var(--fleet-black); margin: 0; }
.glance-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); }

.glance-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 1250px) { .glance-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 800px)  { .glance-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

.glance-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  font-family: inherit;
  padding: var(--pad-large, 20px);
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-left: 3px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  cursor: pointer;
}
.glance-card:hover { border-color: var(--fleet-black-25, var(--fleet-black-10)); }
.glance-card--good     { border-left-color: var(--status-good); }
.glance-card--fair     { border-left-color: var(--status-fair); }
.glance-card--critical { border-left-color: var(--status-critical); }
.glance-card--neutral  { border-left-color: var(--fleet-black-25, var(--fleet-black-10)); }
/* No data is its own state: a grey rail, never a green one. */
.glance-card--none     { border-left-color: var(--fleet-black-10); }

.glance-label { font-size: var(--font-size-sm); color: var(--fleet-black-75); font-weight: 600; }
.glance-value { font-size: 26px; font-weight: 700; color: var(--fleet-black); line-height: 1.15; }
.glance-value--none { color: var(--fleet-black-33); }
.glance-unit { font-size: 13px; font-weight: 600; color: var(--fleet-black-50); }
.glance-sub { font-size: var(--font-size-xs, 11px); color: var(--fleet-black-50); }

.glance-foot {
  margin: var(--pad-medium) 0 0;
  font-size: var(--font-size-xs, 11px);
  color: var(--fleet-black-50);
  max-width: 78ch;
}
</style>
