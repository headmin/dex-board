<template>
  <div class="device-detail-overlay" @click.self="$emit('close')">
    <div class="device-detail-panel">
      <header class="panel-header">
        <div class="header-info">
          <h2>{{ device.hostname || device.computer_name || 'Unknown Device' }}</h2>
          <div class="header-meta">
            <span class="meta-badge">{{ device.hardware_model || 'Unknown model' }}</span>
            <span class="meta-badge">{{ device.os_name }} {{ device.os_version }}</span>
            <span class="meta-id">{{ device.host_identifier }}</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="compare-link" @click="$emit('compare', device.host_identifier)" title="Compare with another device">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            Compare
          </button>
          <a :href="fleetUrl" target="_blank" class="fleet-link" title="View in Fleet">
            Open in Fleet
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
          <button class="close-btn" @click="$emit('close')">&times;</button>
        </div>
      </header>

      <div class="panel-content">
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
          <h3>Device Information</h3>
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
                <span class="signal-badge" :class="signalClass">{{ network.wifi_rssi }} dBm</span>
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
                <td><span class="state-badge" :class="proc.state">{{ proc.state || 'unknown' }}</span></td>
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

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const props = defineProps({
  device: { type: Object, required: true },
  fleetServerUrl: { type: String, default: 'http://localhost:8080' }
})

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
    ? `${props.fleetServerUrl}/hosts?query=${encodeURIComponent(hostname)}`
    : `${props.fleetServerUrl}/hosts`
})

const signalClass = computed(() => {
  const rssi = parseFloat(network.value?.wifi_rssi)
  if (rssi >= -50) return 'excellent'
  if (rssi >= -60) return 'good'
  if (rssi >= -70) return 'fair'
  return 'poor'
})

const signalQuality = computed(() => signalClass.value)

const historyChartOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: {
    data: ['Memory %', 'Disk %'],
    bottom: 0,
    textStyle: { color: '#515774', fontSize: 12 }
  },
  grid: { left: '3%', right: '4%', bottom: '15%', top: '8%', containLabel: true },
  xAxis: {
    type: 'category',
    data: memoryHistory.value.map(d => dayjs(d.time).format('HH:mm')),
    axisLabel: { rotate: 45, fontSize: 11, color: '#8b8fa2' },
    axisLine: { lineStyle: { color: '#e2e4ea' } }
  },
  yAxis: {
    type: 'value', max: 100, min: 0,
    axisLabel: { formatter: '{value}%', color: '#8b8fa2', fontSize: 11 },
    splitLine: { lineStyle: { color: '#f0f1f4' } }
  },
  series: [
    {
      name: 'Memory %',
      type: 'line',
      smooth: true,
      showSymbol: false,
      areaStyle: { opacity: 0.1, color: '#6a67fe' },
      lineStyle: { color: '#6a67fe', width: 2 },
      itemStyle: { color: '#6a67fe' },
      data: memoryHistory.value.map(d => d.memory_percent)
    },
    {
      name: 'Disk %',
      type: 'line',
      smooth: true,
      showSymbol: false,
      areaStyle: { opacity: 0.08, color: '#ebbc43' },
      lineStyle: { color: '#ebbc43', width: 2 },
      itemStyle: { color: '#ebbc43' },
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
  background: #fff;
  box-shadow: -4px 0 24px rgba(52, 59, 96, 0.2);
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--pad-large);
  border-bottom: 1px solid #e2e4ea;
  background: #f9fafc;
}

.header-info h2 {
  font-size: 18px;
  font-weight: 600;
  color: #192147;
  margin: 0 0 6px 0;
}

.header-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.meta-badge {
  font-size: 12px;
  padding: 2px 8px;
  background: #f4f4f6;
  border-radius: 4px;
  color: #515774;
  font-weight: 500;
}

.meta-id {
  font-size: 11px;
  color: #8b8fa2;
  font-family: "SourceCodePro", monospace;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.compare-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #6a67fe;
  color: #6a67fe;
  border-radius: 4px;
  font-family: "Inter", sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms;
}

.compare-link:hover {
  background: rgba(106, 103, 254, 0.08);
}

.fleet-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #009a7d;
  color: #fff;
  text-decoration: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  transition: background 150ms;
}

.fleet-link:hover { background: #007d65; }

.close-btn {
  width: 36px; height: 36px;
  border: none;
  background: none;
  font-size: 22px;
  cursor: pointer;
  color: #8b8fa2;
  border-radius: 4px;
  transition: all 150ms;
}

.close-btn:hover { background: #f4f4f6; color: #192147; }

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--pad-large);
}

.detail-section {
  margin-bottom: var(--pad-large);
}

.detail-section h3 {
  font-size: 12px;
  font-weight: 600;
  color: #8b8fa2;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

/* Health Ring Cards */
.health-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.health-card {
  background: #f9fafc;
  border: 1px solid #e2e4ea;
  border-radius: 8px;
  padding: 16px 12px;
  text-align: center;
}

.health-label {
  font-size: 12px;
  color: #8b8fa2;
  font-weight: 500;
  margin-bottom: 8px;
}

.health-ring {
  width: 64px; height: 64px;
  border-radius: 50%;
  border: 3px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 6px;
}

.health-ring.good { border-color: #3db67b; background: rgba(61,182,123,0.06); }
.health-ring.warning { border-color: #ebbc43; background: rgba(235,188,67,0.06); }
.health-ring.critical { border-color: #d66c7b; background: rgba(214,108,123,0.06); }
.health-ring.neutral { border-color: #c5c7d1; background: #f9fafc; }

.ring-value { font-size: 18px; font-weight: 600; color: #192147; }

.health-sub {
  font-size: 11px;
  color: #8b8fa2;
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
  padding: 8px 0;
  border-bottom: 1px solid #f0f1f4;
}

.info-row:last-child { border-bottom: none; }

.info-key { font-size: 13px; color: #8b8fa2; font-weight: 500; }
.info-val { font-size: 13px; color: #192147; font-weight: 500; }
.info-val.mono { font-family: "SourceCodePro", monospace; }

/* Security Grid */
.security-grid { display: flex; flex-direction: column; gap: 6px; }

.security-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(214,108,123,0.08);
  border-radius: 4px;
  border-left: 3px solid #d66c7b;
}

.security-item.enabled {
  background: rgba(61,182,123,0.06);
  border-left-color: #3db67b;
}

.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #d66c7b;
  flex-shrink: 0;
}

.security-item.enabled .status-dot { background: #3db67b; }

.security-name { font-size: 13px; color: #192147; flex: 1; }

.security-status {
  font-size: 12px;
  font-weight: 600;
  color: #8b8fa2;
}

.security-item.enabled .security-status { color: #3db67b; }
.security-item:not(.enabled) .security-status { color: #d66c7b; }

/* Signal Badge */
.signal-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  margin-right: 6px;
}

.signal-badge.excellent { background: rgba(61,182,123,0.15); color: #2b7f56; }
.signal-badge.good { background: rgba(106,103,254,0.12); color: #4b4ab4; }
.signal-badge.fair { background: rgba(235,188,67,0.2); color: #92400e; }
.signal-badge.poor { background: rgba(214,108,123,0.15); color: #991b1b; }

.signal-quality {
  font-size: 12px;
  color: #8b8fa2;
  text-transform: capitalize;
}

/* History Chart */
.history-chart { width: 100%; height: 220px; }

/* Data Table */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th,
.data-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid #f0f1f4;
}

.data-table th {
  font-size: 12px;
  font-weight: 600;
  color: #8b8fa2;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  background: #f9fafc;
}

.data-table td { color: #192147; }
.data-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.data-table .mono { font-family: "SourceCodePro", monospace; font-size: 12px; }
.data-table .process-name { font-weight: 500; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.state-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #f4f4f6;
  color: #515774;
}

.state-badge.running { background: rgba(61,182,123,0.1); color: #2b7f56; }
.state-badge.sleeping { background: rgba(106,103,254,0.08); color: #4b4ab4; }

.loading, .no-data {
  padding: 24px;
  text-align: center;
  color: #8b8fa2;
  font-size: 13px;
}

@media (max-width: 640px) {
  .health-cards { grid-template-columns: repeat(2, 1fr); }
}
</style>
