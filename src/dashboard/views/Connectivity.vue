<template>
  <div class="dashboard page-stack">
    <PageHeader
      title="Connectivity"
      subtitle="Is the fleet reporting, and how's the network underneath it"
    />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Check-in pulse ─── -->
    <section class="section">
      <SectionHeader
        title="Reporting status"
        :caption="`Telemetry freshness, anchored to host-health reporting (the schedule confirmed flowing). Freshest report ${checkin.freshest_lag_hours != null ? checkin.freshest_lag_hours + 'h ago' : '—'}.`"
      />
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
      <SectionHeader title="Wi-Fi signal" />
      <div class="metrics-row four-col">
        <MetricCard label="Hosts on Wi-Fi" :value="wifi.unique_hosts" :loading="loading" />
        <MetricCard label="Avg RSSI" :value="wifi.avg_rssi" unit="dBm" :loading="loading" />
        <MetricCard label="Avg SNR" :value="wifi.avg_snr" unit="dB" :loading="loading" />
        <MetricCard label="Avg link rate" :value="wifi.avg_transmit_rate" unit="Mbps" :loading="loading" />
      </div>
      <div class="charts-row two-col">
        <section class="section">
          <ChartCard title="Signal quality distribution" :loading="loading" :empty="!wifiDist.length">
            <DistributionStrip :data="wifiDist" nameKey="signal_quality" valueKey="cnt"
              :order="SIGNAL_ORDER" :tones="SIGNAL_TONES" />
          </ChartCard>
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
      <SectionHeader title="VPN & network confidence" />
      <div class="metrics-row four-col">
        <MetricCard label="Tunnel active" :value="vpn.vpn_active" :loading="loading" />
        <MetricCard label="Direct connected" :value="vpn.direct_connected" :loading="loading" />
        <MetricCard label="Disconnected" :value="vpn.disconnected" :loading="loading" />
        <MetricCard label="Avg tunnels / host" :value="vpn.avg_tunnels" :loading="loading" />
      </div>
      <div class="charts-row two-col">
        <section class="section">
          <ChartCard title="Network confidence" :loading="loading" :empty="!vpnDist.length">
            <DistributionStrip :data="vpnDist" nameKey="network_confidence" valueKey="device_count"
              :order="NETWORK_ORDER" :tones="NETWORK_TONES" />
          </ChartCard>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { query } from '../services/api'
import MetricCard from '../components/MetricCard.vue'
import ChartCard from '../components/base/ChartCard.vue'
import DistributionStrip from '../components/base/DistributionStrip.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import { useFleetFilter } from '../composables/useFleetFilter'

const SIGNAL_ORDER = ['excellent', 'good', 'fair', 'weak', 'poor', 'very_weak', 'unknown']
const SIGNAL_TONES = { excellent: 'good', good: 'soft', fair: 'fair', weak: 'elevated', poor: 'critical', very_weak: 'critical', unknown: 'neutral' }
const NETWORK_ORDER = ['direct_connected', 'tunnel_active', 'vpn_active', 'proxy_suspected', 'disconnected', 'unknown']
const NETWORK_TONES = { direct_connected: 'good', tunnel_active: 'info', vpn_active: 'info', proxy_suspected: 'fair', disconnected: 'critical', unknown: 'neutral' }

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
.section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}
.connectivity-note { gap: 6px; }
.connectivity-note h3 { font-size: var(--font-size-md); margin: 0; color: var(--fleet-black); font-weight: 700; }
.connectivity-note p { font-size: var(--font-size-sm); color: var(--fleet-black-50); line-height: 1.5; margin: 0; }
</style>
