<template>
  <div class="dashboard page-stack">
    <PageHeader
      title="Connectivity"
      subtitle="Is the fleet reporting, and how's the network underneath it"
    />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Answer — is the fleet reporting? ────────────────── -->
    <section class="cn-hero">
      <div class="hero-block">
        <span class="hero-eyebrow">Reporting &lt; 24h</span>
        <div class="hero-count-row">
          <span class="hero-count">{{ checkin.within_24h ?? '—' }}</span>
          <span class="hero-count-of">of {{ checkin.total_hosts ?? '—' }} hosts</span>
        </div>
        <span v-if="checkin.freshest_lag_hours != null" class="hero-chip">freshest report {{ checkin.freshest_lag_hours }}h ago</span>
      </div>
      <div class="hero-narrative">
        <p class="hero-headline">
          <template v-if="reportingPct != null">
            <span :class="reportingPct >= 90 ? 'hl-good' : 'hl-fair'">{{ reportingPct }}% of the fleet reported within 24 hours</span><template v-if="Number(checkin.stale_7d)">, but {{ checkin.stale_7d }} host{{ Number(checkin.stale_7d) === 1 ? ' has' : 's have' }} been silent for over a week</template>.
          </template>
          <template v-else>No check-in telemetry in this window.</template>
        </p>
        <p v-if="weakPct" class="hero-support">
          On the network beneath it: {{ weakPct }}% of Wi-Fi samples read fair or worse — endpoint-side signal only, the host's view of the air.
        </p>
      </div>
      <div class="hero-rail">
        <span class="hero-eyebrow">Network path</span>
        <div class="hero-rail-list">
          <div class="hero-rail-row"><span>Tunnel / VPN active</span><span class="hero-rail-count">{{ vpn.vpn_active ?? '—' }}</span></div>
          <div class="hero-rail-row"><span>Direct connected</span><span class="hero-rail-count">{{ vpn.direct_connected ?? '—' }}</span></div>
          <div class="hero-rail-row" :class="{ 'hero-rail-row--bad': Number(vpn.disconnected) }"><span>Disconnected</span><span class="hero-rail-count">{{ vpn.disconnected ?? '—' }}</span></div>
        </div>
      </div>
    </section>

    <!-- ─── Why — check-in freshness ─── -->
    <section class="section">
      <div class="grammar-head">
        <h2 class="grammar-title">Why — telemetry freshness</h2>
        <span class="grammar-hint">Anchored to host-health reporting — the schedule confirmed flowing</span>
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
      <div class="grammar-head">
        <h2 class="grammar-title">Who — Wi-Fi signal across the fleet</h2>
      </div>
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
      <div class="grammar-head">
        <h2 class="grammar-title">Who — VPN &amp; network confidence</h2>
      </div>
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

const reportingPct = computed(() => {
  const t = Number(checkin.value.total_hosts) || 0
  const n = Number(checkin.value.within_24h)
  if (!t || !isFinite(n)) return null
  return Math.round((n / t) * 100)
})
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

/* ─── Briefing hero ────────────────────────────── */
.cn-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-xlarge) 32px;
  display: grid;
  grid-template-columns: 280px 1fr 280px;
  gap: 40px;
  align-items: center;
  color: var(--fleet-white);
}
.hero-eyebrow { font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black-50); letter-spacing: 0.4px; text-transform: uppercase; }
.hero-block { display: flex; flex-direction: column; gap: 8px; }
.hero-count-row { display: flex; align-items: baseline; gap: 12px; }
.hero-count { font-size: 56px; font-weight: 700; line-height: 0.9; }
.hero-count-of { font-size: 15px; color: var(--fleet-black-33); }
.hero-chip { display: inline-flex; align-self: flex-start; padding: 3px 9px; border-radius: var(--radius); background: rgba(255,255,255,0.1); color: var(--fleet-black-10); font-size: var(--font-size-sm); font-weight: 600; }
.hero-narrative { display: flex; flex-direction: column; gap: 12px; border-left: 1px solid var(--fleet-blue); padding-left: 40px; }
.hero-headline { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.35; text-wrap: pretty; }
.hl-good { color: var(--status-good-soft); }
.hl-fair { color: var(--status-fair); }
.hero-support { margin: 0; font-size: var(--font-size-base); line-height: 1.6; color: var(--fleet-black-33); text-wrap: pretty; }
.hero-rail { display: flex; flex-direction: column; gap: 10px; }
.hero-rail-list { display: flex; flex-direction: column; gap: 8px; }
.hero-rail-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.06); border-radius: var(--radius-medium); font-size: var(--font-size-base); }
.hero-rail-row--bad { background: rgba(235, 67, 67, 0.16); }
.hero-rail-count { font-family: var(--font-mono); font-weight: 700; }

.grammar-head { display: flex; align-items: baseline; justify-content: space-between; }
.grammar-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.grammar-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); }

@media (max-width: 1100px) {
  .cn-hero { grid-template-columns: 1fr; gap: 20px; }
  .hero-narrative { border-left: none; padding-left: 0; }
}
.connectivity-note { gap: 6px; }
.connectivity-note h3 { font-size: var(--font-size-md); margin: 0; color: var(--fleet-black); font-weight: 700; }
.connectivity-note p { font-size: var(--font-size-sm); color: var(--fleet-black-50); line-height: 1.5; margin: 0; }
</style>
