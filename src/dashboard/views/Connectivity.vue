<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Connectivity &amp; check-in</h1>
      <span class="subtitle">Is the fleet reporting, and how's the network underneath it</span>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Check-in pulse ─── -->
    <section class="section">
      <div class="section-header-with-caption">
        <h2>Reporting status</h2>
        <span class="section-caption">
          Telemetry freshness, anchored to device-health reporting (the schedule confirmed flowing).
          Freshest report {{ checkin.freshest_lag_hours != null ? checkin.freshest_lag_hours + 'h ago' : '—' }}.
        </span>
      </div>
      <div class="metrics-row four-col">
        <MetricCard label="Reporting < 1h" :value="checkin.within_1h" :loading="loading"
          :subtitle="pct(checkin.within_1h)" />
        <MetricCard label="Reporting < 24h" :value="checkin.within_24h" :loading="loading"
          :subtitle="pct(checkin.within_24h)" />
        <MetricCard label="Stale > 7d" :value="checkin.stale_7d" :loading="loading"
          :subtitle="pct(checkin.stale_7d)" />
        <MetricCard label="Hosts tracked" :value="checkin.total_hosts" :loading="loading" />
      </div>
    </section>

    <!-- ─── Wi-Fi ─── -->
    <section class="section">
      <h2>Wi-Fi signal</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Hosts on Wi-Fi" :value="wifi.unique_hosts" :loading="loading" />
        <MetricCard label="Avg RSSI" :value="wifi.avg_rssi" unit="dBm" :loading="loading" />
        <MetricCard label="Avg SNR" :value="wifi.avg_snr" unit="dB" :loading="loading" />
        <MetricCard label="Avg link rate" :value="wifi.avg_transmit_rate" unit="Mbps" :loading="loading" />
      </div>
      <div class="charts-row two-col">
        <section class="section">
          <PieChart title="Signal quality distribution" :data="wifiDist" :loading="loading"
            nameKey="signal_quality" valueKey="cnt" />
        </section>
        <section class="section connectivity-note">
          <h3>Weak-signal hosts</h3>
          <p>
            {{ weakPct }}% of Wi-Fi samples are fair or worse. Endpoint-side signal only —
            this is the host's view of the air, not the network's topology.
          </p>
        </section>
      </div>
    </section>

    <!-- ─── VPN / network confidence ─── -->
    <section class="section">
      <h2>VPN &amp; network confidence</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Tunnel active" :value="vpn.vpn_active" :loading="loading" />
        <MetricCard label="Direct connected" :value="vpn.direct_connected" :loading="loading" />
        <MetricCard label="Disconnected" :value="vpn.disconnected" :loading="loading" />
        <MetricCard label="Avg tunnels / host" :value="vpn.avg_tunnels" :loading="loading" />
      </div>
      <div class="charts-row two-col">
        <section class="section">
          <PieChart title="Network confidence" :data="vpnDist" :loading="loading"
            nameKey="network_confidence" valueKey="device_count" />
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { query } from '../services/api'
import MetricCard from '../components/MetricCard.vue'
import PieChart from '../components/PieChart.vue'
import { useFleetFilter } from '../composables/useFleetFilter'

const { filterParams } = useFleetFilter()
const fp = () => ({ ...filterParams.value })

const error = ref(null)
const loading = ref(false)
const checkin = ref({})
const wifi = ref({})
const wifiDist = ref([])
const vpn = ref({})
const vpnDist = ref([])

function pct(n) {
  const t = Number(checkin.value.total_hosts) || 0
  if (!t || n == null) return ''
  return `${Math.round((Number(n) / t) * 100)}% of fleet`
}
const weakPct = computed(() => {
  const total = wifiDist.value.reduce((s, r) => s + Number(r.cnt || 0), 0)
  if (!total) return 0
  const weak = wifiDist.value
    .filter(r => ['fair', 'poor', 'very_weak', 'unusable'].includes(r.signal_quality))
    .reduce((s, r) => s + Number(r.cnt || 0), 0)
  return Math.round((weak / total) * 100)
})

async function load() {
  error.value = null
  loading.value = true
  try {
    const [c, ws, wd, vs, vd] = await Promise.all([
      query('firehose.fleetd.checkin_status', fp()),
      query('firehose.wifi.summary', fp()),
      query('firehose.wifi.quality_distribution', fp()),
      query('firehose.vpn.summary', fp()),
      query('firehose.vpn.confidence_distribution', fp()),
    ])
    checkin.value = c[0] || {}
    wifi.value = ws[0] || {}
    wifiDist.value = wd || []
    vpn.value = vs[0] || {}
    vpnDist.value = vd || []
  } catch (e) {
    error.value = e.message
  }
  loading.value = false
}

onMounted(load)
watch(filterParams, load, { deep: true })
</script>

<style scoped>
.section-header-with-caption { margin-bottom: var(--pad-medium); }
.section-caption { display: block; font-size: var(--font-size-sm); color: var(--fleet-black-50); margin-top: 2px; }
.connectivity-note h3 { font-size: var(--font-size-md); margin-bottom: 6px; color: var(--fleet-black); font-weight: 700; }
.connectivity-note p { font-size: var(--font-size-sm); color: var(--fleet-black-50); line-height: 1.5; }
</style>
