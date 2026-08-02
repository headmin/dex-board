<template>
  <div class="device-detail-overlay" @click.self="$emit('close')">
    <div class="device-detail-panel">
      <header class="panel-header">
        <div class="header-info">
          <h2>{{ displayHost(device) }}</h2>
          <div class="header-meta">
            <Badge>{{ device.hardware_model || 'Unknown model' }}</Badge>
            <Badge>{{ device.os_name }} {{ device.os_version }}</Badge>
            <span class="meta-id">{{ device.host_identifier }}</span>
          </div>
        </div>
        <div class="header-actions">
          <BaseButton variant="secondary" size="small" title="Compare with another device" @click="$emit('compare', device.host_identifier)">
            <template #icon>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </template>
            Compare
          </BaseButton>
          <a :href="fleetUrl" target="_blank" class="fleet-link" title="View in Fleet">
            Open in Fleet
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
          <IconButton label="Close" @click="$emit('close')">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </IconButton>
        </div>
      </header>

      <div class="panel-content">
        <!-- Support snapshot — pre-connect briefing -->
        <section v-if="supportSnapshot.length" class="detail-section support-snapshot">
          <h3>Support snapshot</h3>
          <p class="support-hint">At-a-glance before you connect — worst signals first. For remote control or scripts, open the host in Fleet.</p>
          <div class="snapshot-chips">
            <Chip v-for="c in supportSnapshot" :key="c.label" :tone="sevTone(c.sev)" :label="c.label" :value="c.val" />
          </div>
        </section>

        <!-- Health Status -->
        <section class="detail-section">
          <h3>Health Status</h3>
          <div class="health-cards">
            <div class="health-card" v-if="health">
              <div class="health-label">Memory</div>
              <div class="health-ring" :class="getHealthClass(health.memory_percent, 75, 90)">
                <span class="ring-value">{{ health.memory_percent }}%</span>
              </div>
              <div class="health-sub">{{ health.memory_used_gb }} / {{ health.memory_total_gb }} GB</div>
            </div>
            <div class="health-card" v-if="health">
              <div class="health-label">Disk</div>
              <div class="health-ring" :class="getHealthClass(health.disk_percent, 80, 90)">
                <span class="ring-value">{{ health.disk_percent }}%</span>
              </div>
              <div class="health-sub">{{ health.disk_free_gb }} GB free</div>
            </div>
            <div class="health-card" v-if="health">
              <div class="health-label">Uptime</div>
              <div class="health-ring neutral">
                <span class="ring-value">{{ health.uptime_days }}</span>
              </div>
              <div class="health-sub">days</div>
            </div>
            <div class="health-card" v-if="health">
              <div class="health-label">CPU</div>
              <div class="health-ring neutral">
                <span class="ring-value">{{ health.cpu_cores || '-' }}</span>
              </div>
              <div class="health-sub cpu-sub">{{ health.cpu_brand || '' }}</div>
            </div>
          </div>
        </section>

        <!-- Device Information -->
        <section class="detail-section">
          <h3>Host information</h3>
          <div class="info-table">
            <div class="info-row">
              <span class="info-key">Hostname</span>
              <span class="info-val">{{ device.hostname || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-key">Computer Name</span>
              <span class="info-val">{{ device.computer_name || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-key">Serial Number</span>
              <span class="info-val mono">{{ device.serial_number || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-key">Hardware Model</span>
              <span class="info-val">{{ device.hardware_model || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-key">OS</span>
              <span class="info-val">{{ device.os_name }} {{ device.os_version }}</span>
            </div>
            <div class="info-row">
              <span class="info-key">Last Seen</span>
              <span class="info-val">{{ formatDate(device.last_seen) }}</span>
            </div>
          </div>
        </section>

        <!-- Security Posture -->
        <section class="detail-section" v-if="security">
          <h3>Security Posture</h3>
          <div class="security-grid">
            <div class="security-item" :class="{ enabled: security.disk_encrypted === '1' }">
              <span class="status-dot"></span>
              <span class="security-name">Disk Encryption</span>
              <span class="security-status">{{ security.disk_encrypted === '1' ? 'Enabled' : 'Disabled' }}</span>
            </div>
            <div class="security-item" :class="{ enabled: security.firewall_enabled === '1' }">
              <span class="status-dot"></span>
              <span class="security-name">Firewall</span>
              <span class="security-status">{{ security.firewall_enabled === '1' ? 'Enabled' : 'Disabled' }}</span>
            </div>
            <div class="security-item" :class="{ enabled: security.sip_enabled === '1' }">
              <span class="status-dot"></span>
              <span class="security-name">System Integrity Protection</span>
              <span class="security-status">{{ security.sip_enabled === '1' ? 'Enabled' : 'Disabled' }}</span>
            </div>
            <div class="security-item" :class="{ enabled: security.gatekeeper_enabled === '1' }">
              <span class="status-dot"></span>
              <span class="security-name">Gatekeeper</span>
              <span class="security-status">{{ security.gatekeeper_enabled === '1' ? 'Enabled' : 'Disabled' }}</span>
            </div>
          </div>
        </section>

        <!-- Network -->
        <section class="detail-section" v-if="network">
          <h3>Network</h3>
          <div class="info-table">
            <div class="info-row">
              <span class="info-key">WiFi SSID</span>
              <span class="info-val">{{ network.wifi_ssid || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-key">Signal Strength</span>
              <span class="info-val">
                <Badge class="signal-badge" :tone="signalTone" :label="`${network.wifi_rssi} dBm`" />
                <span class="signal-quality">{{ signalQuality }}</span>
              </span>
            </div>
            <div class="info-row">
              <span class="info-key">Channel</span>
              <span class="info-val">{{ network.wifi_channel || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-key">Transmit Rate</span>
              <span class="info-val">{{ network.wifi_transmit_rate || '-' }} Mbps</span>
            </div>
          </div>
        </section>

        <!-- Memory & Disk History -->
        <section class="detail-section">
          <h3>Resource History</h3>
          <div v-if="loadingHistory" class="loading">Loading...</div>
          <v-chart v-else-if="memoryHistory.length" class="history-chart" :option="historyChartOption" autoresize />
          <div v-else class="no-data">No history available</div>
        </section>

        <!-- Top Processes -->
        <section class="detail-section">
          <h3>Top Processes</h3>
          <div v-if="loadingProcesses" class="loading">Loading...</div>
          <table v-else-if="processes.length" class="data-table">
            <thead>
              <tr>
                <th>Process</th>
                <th class="num">Memory (MB)</th>
                <th class="num">PID</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="proc in processes" :key="proc.pid">
                <td class="process-name">{{ proc.process_name }}</td>
                <td class="num">{{ proc.memory_mb }}</td>
                <td class="num mono">{{ proc.pid }}</td>
                <td><Badge :tone="proc.state === 'running' ? 'good' : 'neutral'" :label="proc.state || 'unknown'" /></td>
              </tr>
            </tbody>
          </table>
          <div v-else class="no-data">No process data available</div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { query } from '../services/api'
import dayjs from 'dayjs'
import Badge from './base/Badge.vue'
import BaseButton from './base/BaseButton.vue'
import Chip from './base/Chip.vue'
import IconButton from './base/IconButton.vue'
import { displayHost } from '../composables/displayName'
import { useAppConfig } from '../composables/useAppConfig'
import { palette } from '../composables/uiPalette'
import { baseTooltip, baseAxisLabel, baseAxisLine, baseSplitLine } from '../composables/echartsTheme'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const props = defineProps({
  device: { type: Object, required: true },
  // Optional override. Normally comes from the worker FLEET_URL secret
  // via useAppConfig; pass this prop only for ad-hoc instance switching.
  fleetServerUrl: { type: String, default: '' }
})

const { config: appConfig } = useAppConfig()
const fleetBase = computed(() => props.fleetServerUrl || appConfig.value.fleetUrl)

defineEmits(['close', 'compare'])

const health = ref(null)
const security = ref(null)
const network = ref(null)
const processes = ref([])
const memoryHistory = ref([])
const loadingProcesses = ref(false)
const loadingHistory = ref(false)

const fleetUrl = computed(() => {
  const hostname = props.device.hostname || props.device.computer_name
  return hostname
    ? `${fleetBase.value}/hosts?query=${encodeURIComponent(hostname)}`
    : `${fleetBase.value}/hosts`
})

const signalClass = computed(() => {
  const rssi = parseFloat(network.value?.wifi_rssi)
  if (rssi >= -50) return 'excellent'
  if (rssi >= -60) return 'good'
  if (rssi >= -70) return 'fair'
  return 'poor'
})

const signalQuality = computed(() => signalClass.value)

// Presentation-only tone maps for the Badge/Chip primitives
const SIGNAL_TONE = { excellent: 'good', good: 'good', fair: 'fair', poor: 'critical' }
const signalTone = computed(() => SIGNAL_TONE[signalClass.value] || 'neutral')

const SEV_TONE = { ok: 'good', mid: 'fair', high: 'critical' }
function sevTone(sev) { return SEV_TONE[sev] || 'neutral' }

// Pre-connect support briefing — the support-relevant state at a glance,
// derived from data already fetched (no extra queries). Sorted worst-first.
const supportSnapshot = computed(() => {
  const chips = []
  const s = security.value, h = health.value, n = network.value
  if (s) {
    chips.push({ label: 'FileVault', val: s.disk_encrypted === '1' ? 'On' : 'OFF', sev: s.disk_encrypted === '1' ? 'ok' : 'high' })
    chips.push({ label: 'Firewall', val: s.firewall_enabled === '1' ? 'On' : 'OFF', sev: s.firewall_enabled === '1' ? 'ok' : 'high' })
  }
  if (h) {
    if (h.memory_percent != null) chips.push({ label: 'Memory', val: h.memory_percent + '%', sev: h.memory_percent >= 90 ? 'high' : h.memory_percent >= 75 ? 'mid' : 'ok' })
    if (h.disk_percent != null) chips.push({ label: 'Disk', val: h.disk_percent + '%', sev: h.disk_percent >= 90 ? 'high' : h.disk_percent >= 80 ? 'mid' : 'ok' })
  }
  if (n && n.wifi_rssi) chips.push({ label: 'Wi-Fi', val: `${signalQuality.value} (${n.wifi_rssi}dBm)`, sev: signalQuality.value === 'poor' ? 'high' : signalQuality.value === 'fair' ? 'mid' : 'ok' })
  const rank = { high: 0, mid: 1, ok: 2 }
  return chips.slice().sort((a, b) => rank[a.sev] - rank[b.sev])
})

const historyChartOption = computed(() => ({
  tooltip: { ...baseTooltip },
  legend: {
    data: ['Memory %', 'Disk %'],
    bottom: 0,
    textStyle: { color: palette.ink75, fontSize: 11 }
  },
  grid: { left: '3%', right: '4%', bottom: '15%', top: '8%', containLabel: true },
  xAxis: {
    type: 'category',
    data: memoryHistory.value.map(d => dayjs(d.time).format('HH:mm')),
    axisLabel: { ...baseAxisLabel, rotate: 45 },
    axisLine: { ...baseAxisLine }
  },
  yAxis: {
    type: 'value', max: 100, min: 0,
    axisLabel: { ...baseAxisLabel, formatter: '{value}%' },
    splitLine: { ...baseSplitLine }
  },
  series: [
    {
      name: 'Memory %',
      type: 'line',
      smooth: true,
      showSymbol: false,
      areaStyle: { opacity: 0.1, color: palette.info },
      lineStyle: { color: palette.info, width: 2 },
      itemStyle: { color: palette.info },
      data: memoryHistory.value.map(d => d.memory_percent)
    },
    {
      name: 'Disk %',
      type: 'line',
      smooth: true,
      showSymbol: false,
      areaStyle: { opacity: 0.08, color: palette.fair },
      lineStyle: { color: palette.fair, width: 2 },
      itemStyle: { color: palette.fair },
      data: memoryHistory.value.map(d => d.disk_percent)
    }
  ]
}))

function formatDate(date) {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'
}

function getHealthClass(value, warn, crit) {
  const num = parseFloat(value)
  if (num >= crit) return 'critical'
  if (num >= warn) return 'warning'
  return 'good'
}

async function fetchDeviceData() {
  const hostId = props.device.host_identifier

  try {
    const [healthData, securityData, networkData] = await Promise.all([
      query('devices.detail', { hostIdentifier: hostId }),
      query('devices.security', { hostIdentifier: hostId }),
      query('devices.network', { hostIdentifier: hostId }).catch(() => [])
    ])
    if (healthData.length) health.value = healthData[0]
    if (securityData.length) security.value = securityData[0]
    if (networkData.length) network.value = networkData[0]
  } catch (e) {
    console.error('Failed to fetch device data:', e)
  }

  loadingProcesses.value = true
  try {
    processes.value = await query('processes.device_top', { hostIdentifier: hostId })
  } catch (e) {
    console.error('Failed to fetch processes:', e)
  } finally {
    loadingProcesses.value = false
  }

  loadingHistory.value = true
  try {
    memoryHistory.value = await query('health.device_history', { hostIdentifier: hostId })
  } catch (e) {
    console.error('Failed to fetch history:', e)
  } finally {
    loadingHistory.value = false
  }
}

onMounted(fetchDeviceData)
</script>

<style scoped>
.device-detail-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(25, 33, 71, 0.4);
  display: flex;
  justify-content: flex-end;
  z-index: 1000;
}

.device-detail-panel {
  width: 720px;
  max-width: 92vw;
  height: 100%;
  background: var(--fleet-white);
  box-shadow: -4px 0 24px rgba(52, 59, 96, 0.2);
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--pad-large);
  border-bottom: 1px solid var(--fleet-black-10);
  background: var(--fleet-off-white);
}

.header-info h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--fleet-black);
  margin: 0 0 5px 0;
}

.header-meta {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: wrap;
}

.meta-id {
  font-size: 10px;
  color: var(--fleet-black-50);
  font-family: var(--font-mono);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
}

.fleet-link {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  background: var(--fleet-green);
  color: var(--fleet-white);
  text-decoration: none;
  border-radius: var(--radius);
  font-size: 12px;
  font-weight: 500;
  transition: background 150ms;
}

.fleet-link:hover { background: var(--fleet-green-over); }

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--pad-large);
}

.detail-section {
  margin-bottom: var(--pad-large);
}

/* Support snapshot — pre-connect briefing strip */
.support-snapshot { background: var(--fleet-off-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius-large); padding: var(--pad-medium); }
.support-hint { font-size: 12px; color: var(--fleet-black-50); margin: -4px 0 10px; line-height: 1.4; }
.snapshot-chips { display: flex; flex-wrap: wrap; gap: var(--pad-small); }

.detail-section h3 {
  font-size: 13px;
  font-weight: 700;
  color: var(--fleet-black);
  margin-bottom: 11px;
}

/* Health Ring Cards */
.health-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 11px;
}

.health-card {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-medium) var(--pad-smedium);
  text-align: center;
}

.health-label {
  font-size: 11px;
  color: var(--fleet-black-50);
  font-weight: 500;
  margin-bottom: 7px;
}

.health-ring {
  width: 64px; height: 64px;
  border-radius: 50%;
  border: 3px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 5px;
}

.health-ring.good { border-color: var(--fleet-success); background: var(--status-good-bg); }
.health-ring.warning { border-color: var(--status-fair); background: var(--status-fair-bg); }
.health-ring.critical { border-color: var(--fleet-error); background: var(--status-critical-bg); }
.health-ring.neutral { border-color: var(--fleet-black-25); background: var(--fleet-off-white); }

.ring-value { font-size: 18px; font-weight: 600; color: var(--fleet-black); }

.health-sub {
  font-size: 10px;
  color: var(--fleet-black-50);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cpu-sub { font-size: 10px; }

/* Info Table */
.info-table { display: flex; flex-direction: column; }

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid var(--fleet-black-5-down);
}

.info-row:last-child { border-bottom: none; }

.info-key { font-size: 13px; color: var(--fleet-black-50); font-weight: 500; }
.info-val { font-size: 13px; color: var(--fleet-black); font-weight: 500; }
.info-val.mono { font-family: var(--font-mono); }

/* Security Grid */
.security-grid { display: flex; flex-direction: column; gap: 6px; }

.security-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 13px;
  background: var(--status-critical-bg);
  border-radius: var(--radius);
}

.security-item.enabled {
  background: var(--status-good-bg);
}

.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--fleet-error);
  flex-shrink: 0;
}

.security-item.enabled .status-dot { background: var(--fleet-success); }

.security-name { font-size: 13px; color: var(--fleet-black); flex: 1; }

.security-status {
  font-size: 11px;
  font-weight: 600;
  color: var(--fleet-black-50);
}

.security-item.enabled .security-status { color: var(--fleet-success); }
.security-item:not(.enabled) .security-status { color: var(--fleet-error); }

/* Signal Badge */
.signal-badge {
  font-variant-numeric: tabular-nums;
  margin-right: 5px;
}

.signal-quality {
  font-size: 11px;
  color: var(--fleet-black-50);
  text-transform: capitalize;
}

/* History Chart */
.history-chart { width: 100%; height: 220px; }

/* Data Table — shared table spec */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--table-font-size);
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  overflow: hidden;
}

.data-table th,
.data-table td {
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  text-align: left;
  border-bottom: 1px solid var(--fleet-black-10);
}

.data-table th {
  font-size: var(--table-header-font-size);
  font-weight: 700;
  color: var(--fleet-black);
  background: var(--fleet-off-white);
}

.data-table tr:last-child td { border-bottom: none; }
.data-table td { color: var(--fleet-black); }
.data-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.data-table .mono { font-family: var(--font-mono); }
.data-table .process-name { font-weight: 500; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.loading, .no-data {
  padding: 22px;
  text-align: center;
  color: var(--fleet-black-50);
  font-size: 12px;
}

@media (max-width: 640px) {
  .health-cards { grid-template-columns: repeat(2, 1fr); }
}
</style>
