<template>
  <div class="dashboard page-stack">
    <PageHeader title="DEX dashboard">
      <template #actions>
        <TimeRangeFilter />
      </template>
    </PageHeader>

    <DrillFilterBar />

    <div v-if="error" class="error-banner">
      {{ error }}
    </div>

    <!-- Overview Metrics (always visible) -->
    <section class="section">
      <SectionHeader title="Overview" />
      <div class="metrics-row four-col">
        <MetricCard label="Total events" :value="metrics.totalEvents" :loading="loading.metrics" />
        <MetricCard label="Hosts" :value="metrics.deviceCount" :loading="loading.metrics" />
        <MetricCard label="Query types" :value="metrics.queryTypes" :loading="loading.metrics" />
        <MetricCard label="P95 memory %" :value="metrics.p95Memory" subtitle="Fleet-wide 95th percentile" :loading="loading.metrics" />
      </div>
    </section>

    <!-- Fleet Health Heatmap (always visible — it's the navigator) -->
    <section class="section">
      <SectionHeader title="Fleet health overview" />
      <div class="heatmap-controls">
        <SegmentedControl v-model="heatmapMode" :options="heatmapModes" />
        <p class="section-caption">
          {{ compareMode ? 'Click a device to set as comparison target'
             : heatmapMode === 'unhealthiest' ? 'Click a cell to drill into a device'
             : heatmapMode === 'by-os' ? 'Click a row to filter by OS'
             : 'Click a row to filter by model' }}
        </p>
      </div>
      <HeatmapChart
        :data="heatmapData"
        :xLabels="heatmapHours"
        :yLabels="heatmapHosts"
        :loading="loading.heatmap"
        :colorRange="statusRamp"
        tooltipLabel="Health score"
        @cell-click="onHeatmapClick"
      />
    </section>

    <!-- ═══════════════════════════════════════════════════
         DEVICE DEEP DIVE — shown when a heatmap cell is clicked
         ═══════════════════════════════════════════════════ -->
    <template v-if="isFiltered">

      <!-- Device Identity + Health Snapshot -->
      <section class="section">
        <div class="drill-header">
          <SectionHeader :title="drill.activeDevice.value + ' — Device overview'" />
          <BaseButton :variant="compareMode ? 'primary' : 'secondary'" @click="compareMode = !compareMode">
            <template #icon>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </template>
            {{ compareMode ? 'Exit compare' : 'Compare' }}
          </BaseButton>
        </div>

        <!-- Device Info Chips -->
        <div v-if="drillDeviceInfo" class="device-info-chips">
          <Chip tone="neutral" label="OS" :value="drillDeviceInfo.os_name + ' ' + drillDeviceInfo.os_version" />
          <Chip tone="neutral" label="Serial" :value="drillDeviceInfo.serial_number" />
          <Chip tone="neutral" label="Model" :value="drillDeviceInfo.hardware_model || '-'" />
          <Chip tone="neutral" label="Last seen" :value="drillDeviceInfo.last_seen" />
        </div>

        <!-- Health + Security Metric Cards -->
        <div class="metrics-row six-col">
          <MetricCard label="Memory %" :value="drillLatest.memory_percent ?? '-'" :loading="loading.drill" />
          <MetricCard label="Disk %" :value="drillLatest.disk_percent ?? '-'" :loading="loading.drill" />
          <MetricCard label="Uptime (days)" :value="drillLatest.uptime_days ?? '-'" :loading="loading.drill" />
          <MetricCard label="Encrypted" :value="drillSec.encrypted === '1' ? 'Yes' : 'No'" :loading="loading.drill" />
          <MetricCard label="Firewall" :value="drillSec.firewall === '1' ? 'Yes' : 'No'" :loading="loading.drill" />
          <MetricCard label="Risk score" :value="drillRiskScore" :loading="loading.drill" />
        </div>
      </section>

      <!-- Device Comparison (replaces normal drill-down when active) -->
      <section v-if="compareMode" class="section">
        <DeviceCompare
          ref="compareRef"
          :initialHostId="drill.activeDeviceId.value"
          :devices="devices"
          @close="compareMode = false"
        />
      </section>

      <!-- Device Health Time Series (hidden in compare mode) -->
      <section v-if="!compareMode" class="section">
        <SectionHeader title="Health history" />
        <div class="charts-row">
          <MultiSeriesChart
            title="Memory & disk usage over time"
            :xLabels="drillHealthLabels"
            :series="drillHealthSeries"
            :yAxes="[{ name: 'Percent', min: 0, max: 100 }]"
            :thresholds="[{ value: 85, label: 'Warning', color: palette.critical }]"
            :anomalies="drillAnomalies"
            :events="drillHealthEvents"
            :loading="loading.drill"
          />
        </div>
      </section>

      <!-- Device Process Timeline (hidden in WC mode — individual process monitoring) -->
      <section v-if="!compareMode && !wcMode" class="section">
        <SectionHeader title="Process activity" />
        <div class="charts-row">
          <SequenceChart
            title="Process timeline"
            :data="drillSequenceData"
            :categories="drillSequenceCategories"
            :timeLabels="drillSequenceTimeLabels"
            :loading="loading.drill"
          />
        </div>
        <div class="charts-row two-col">
          <BarChart
            title="Top processes by memory (MB)"
            :data="drillTopProcesses"
            :loading="loading.drill"
            nameKey="process_name"
            valueKey="avg_mb"
          />
          <DataTable
            title="Recent process events"
            :data="drillRecentProcesses"
            :columns="drillProcessColumns"
            :loading="loading.drill"
          />
        </div>
      </section>
      <section v-else-if="!compareMode && wcMode" class="section">
        <div class="wc-hidden-section">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Process activity hidden — Workers Council mode active
        </div>
      </section>

      <!-- Device Security Detail -->
      <section v-if="!compareMode" class="section">
        <SectionHeader title="Security posture" />
        <div class="security-grid">
          <div class="security-card" :class="drillSec.encrypted === '1' ? 'good' : 'bad'">
            <svg class="sec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <div class="sec-label">Disk encryption</div>
            <div class="sec-status">{{ drillSec.encrypted === '1' ? 'Enabled' : 'Disabled' }}</div>
          </div>
          <div class="security-card" :class="drillSec.firewall === '1' ? 'good' : 'bad'">
            <svg class="sec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <div class="sec-label">Firewall</div>
            <div class="sec-status">{{ drillSec.firewall === '1' ? 'Enabled' : 'Disabled' }}</div>
          </div>
          <div class="security-card" :class="drillSec.sip === '1' ? 'good' : 'bad'">
            <svg class="sec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>
            </svg>
            <div class="sec-label">System integrity protection</div>
            <div class="sec-status">{{ drillSec.sip === '1' ? 'Enabled' : 'Disabled' }}</div>
          </div>
          <div class="security-card" :class="drillSec.gatekeeper === '1' ? 'good' : 'bad'">
            <svg class="sec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path v-if="drillSec.gatekeeper === '1'" d="M9 12l2 2 4-4"/><path v-else d="M15 9l-6 6M9 9l6 6"/>
            </svg>
            <div class="sec-label">Gatekeeper</div>
            <div class="sec-status">{{ drillSec.gatekeeper === '1' ? 'Enabled' : 'Disabled' }}</div>
          </div>
        </div>
      </section>

      <!-- Device Experience Score -->
      <section v-if="drillScores && !compareMode" class="section">
        <SectionHeader title="Experience score" />
        <div class="score-overview">
          <div class="score-hero">
            <div class="score-grade" :class="'grade-' + (drillScores.composite_grade || '').toLowerCase()">
              {{ drillScores.composite_grade || '—' }}
            </div>
            <div class="score-details">
              <div class="score-number">
                {{ Math.round(drillScores.composite_score) }} / 100
                <Badge v-if="drillLifecycle" class="lifecycle-badge" :tone="lifecycleTone" :label="drillLifecycle" />
              </div>
              <div class="score-meta">
                <span v-if="drillScores.lowest_category">Weakest: {{ drillScores.lowest_category }}</span>
                <Badge v-if="drillScores.categories_with_data < 3" tone="neutral" label="Incomplete data" />
              </div>
            </div>
            <div class="score-sparkline" v-if="drillScoreHistory.length">
              <SparklineChart :data="drillScoreHistory" width="160px" height="40px" :color="gradeColor(drillScores.composite_grade)" />
              <span class="sparkline-label">30-day trend</span>
            </div>
          </div>
          <div class="score-categories">
            <div v-for="cat in scoreCategories" :key="cat.key" class="score-cat-row">
              <span class="cat-label">{{ cat.label }}</span>
              <ScoreBar class="cat-bar" :value="cat.value >= 0 ? cat.value : 0" :color="scoreBandColor(cat.value)" />
              <GradeBadge :grade="catGrade(cat.value)" />
              <span class="cat-value">{{ cat.value >= 0 ? Math.round(cat.value) : '—' }}</span>
            </div>
          </div>
          <!-- Platform Benchmark inline -->
          <div v-if="drillBenchmarks" class="benchmark-section">
            <h4>Platform benchmark</h4>
            <PlatformBenchmark
              :deviceScores="drillScores"
              :benchmarkData="drillBenchmarks"
              :lifecycleLabel="drillLifecycle"
              :loading="drillBenchmarkLoading"
              :activeCohort="drillBenchmarkCohort"
              @update:activeCohort="drillBenchmarkCohort = $event"
            />
          </div>
        </div>
      </section>

      <!-- Device Software & Patch Status -->
      <section v-if="(drillSoftwareApps.length || drillPatchHistory.length) && !compareMode" class="section">
        <SectionHeader title="Software & patch status" />
        <div class="software-patch-grid">
          <!-- Patch History (unchanged in both modes) -->
          <div v-if="drillPatchHistory.length" class="sw-panel">
            <h3>Recent patches</h3>
            <div class="patch-list">
              <div v-for="(p, i) in drillPatchHistory" :key="i" class="patch-event">
                <div class="patch-event-header">
                  <span class="patch-sw-name">{{ p.software_name }}</span>
                  <Badge :tone="p.patch_type === 'os' ? 'info' : 'neutral'" :label="p.patch_type === 'os' ? 'OS' : sentenceCase(p.patch_type)" />
                </div>
                <div class="patch-event-detail">
                  <span class="patch-versions">{{ p.old_version }} → {{ p.new_version }}</span>
                  <Badge :tone="patchLagTone(p.days_to_patch)" :label="p.days_to_patch.toFixed(0) + 'd lag'" />
                </div>
              </div>
            </div>
          </div>

          <!-- Software Usage: Normal Mode -->
          <template v-if="!wcMode">
            <div v-if="drillSoftwareApps.length" class="sw-panel">
              <h3>Installed software</h3>
              <div class="usage-summary">
                <SegmentedControl :modelValue="softwareFilter" :options="usageFilterOptions" @update:modelValue="toggleSoftwareFilter" />
              </div>
              <div v-if="softwareFilter" class="filter-active-bar">
                Showing <strong>{{ filteredSoftwareApps.length }}</strong> {{ softwareFilter }} apps
                <BaseButton variant="link" @click="softwareFilter = ''">Clear</BaseButton>
              </div>
              <div class="app-usage-list">
                <div v-for="app in filteredSoftwareApps" :key="app.app_name" class="app-usage-row">
                  <span class="app-usage-name">{{ app.app_name }}</span>
                  <span class="app-usage-ver">{{ app.app_version }}</span>
                  <Badge :tone="usageTone(app.usage_category)" :label="sentenceCase(app.usage_category)" />
                  <span class="app-usage-days">{{ app.days_since_opened }}d</span>
                </div>
              </div>
            </div>
          </template>

          <!-- Software Usage: Workers Council Mode -->
          <template v-else>
            <!-- Aggregate Summary Card -->
            <div v-if="drillSoftwareApps.length" class="sw-panel wc-panel">
              <h3>Software summary</h3>
              <div class="wc-aggregate-card">
                <div class="wc-aggregate-total">{{ wcSoftwareSummary.total }} apps installed</div>
                <div class="wc-category-pills">
                  <Chip tone="good" label="Daily" :value="String(wcSoftwareSummary.daily)" />
                  <Chip tone="info" label="Weekly" :value="String(wcSoftwareSummary.weekly)" />
                  <Chip tone="fair" label="Monthly" :value="String(wcSoftwareSummary.monthly)" />
                  <Chip tone="elevated" label="Unused" :value="String(wcSoftwareSummary.unused)" />
                </div>
              </div>

              <!-- Browser Usage Bar -->
              <div v-if="wcBrowserBreakdown.length" class="wc-browser-section">
                <h4>Browser usage</h4>
                <div class="wc-browser-bar">
                  <div
                    v-for="b in wcBrowserBreakdown"
                    :key="b.name"
                    class="wc-browser-segment"
                    :style="{ width: b.percentage + '%' }"
                    :title="b.name + ' ' + b.percentage + '%'"
                  ></div>
                </div>
                <div class="wc-browser-legend">
                  <span v-for="b in wcBrowserBreakdown" :key="b.name" class="wc-legend-item">
                    {{ b.name }} {{ b.percentage }}%
                  </span>
                </div>
              </div>

              <!-- License Risk List -->
              <div v-if="wcLicenseWaste.length" class="wc-license-section">
                <h4>License risk</h4>
                <div class="wc-license-list">
                  <div v-for="app in wcLicenseWaste" :key="app.app_name" class="wc-license-row">
                    <span class="wc-license-name">{{ app.app_name }}</span>
                    <Badge :tone="usageTone(app.usage_category)" :label="sentenceCase(app.usage_category)" />
                    <span class="wc-license-days">{{ app.days_unused }}d unused</span>
                  </div>
                </div>
              </div>
              <div v-else class="wc-no-license-risk">No licensed software at risk on this device.</div>
            </div>
          </template>
        </div>
      </section>
    </template>

    <!-- ═══════════════════════════════════════════════════
         FLEET-WIDE SECTIONS — hidden when drilled into a device
         ═══════════════════════════════════════════════════ -->
    <template v-else>

      <!-- Devices Section -->
      <section class="section">
        <SectionHeader title="Hosts" caption="Click a device to view details" />
        <DataTable
          title=""
          :data="devices"
          :columns="deviceColumns"
          :loading="loading.devices"
          :clickable="true"
          @row-click="selectDevice"
        />
      </section>

      <!-- Device Detail Panel -->
      <DeviceDetail
        v-if="selectedDevice"
        :device="selectedDevice"
        :fleet-server-url="fleetServerUrl"
        @close="selectedDevice = null"
        @compare="enterCompareFromDetail"
      />

      <!-- Security Posture Section (high visibility) -->
      <section class="section">
        <SectionHeader title="Security posture" />
        <div class="metrics-row four-col">
          <MetricCard label="Disk encrypted" :value="securityMetrics.encryptedCount + '/' + securityMetrics.totalDevices" :loading="loading.security" />
          <MetricCard label="Secure boot" :value="securityMetrics.secureBootCount + '/' + securityMetrics.totalDevices" :loading="loading.security" />
          <MetricCard label="Firewall enabled" :value="securityMetrics.firewallCount + '/' + securityMetrics.totalDevices" :loading="loading.security" />
          <MetricCard label="SIP enabled" :value="securityMetrics.sipCount + '/' + securityMetrics.totalDevices" :loading="loading.security" />
        </div>
        <div class="charts-row">
          <DataTable
            title="Security status by device"
            :data="securityStatus"
            :columns="securityColumns"
            :loading="loading.security"
          />
        </div>
      </section>

      <!-- Device Health Section -->
      <section class="section">
        <SectionHeader title="Host health" />
        <div class="charts-row">
          <MultiSeriesChart
            title="Memory & disk usage"
            :xLabels="healthTimeLabels"
            :series="healthSeries"
            :yAxes="[{ name: 'Percent', min: 0, max: 100 }]"
            :thresholds="[{ value: 85, label: 'Warning', color: palette.critical }]"
            :anomalies="memoryAnomalies"
            :events="fleetHealthEvents"
            :loading="loading.deviceHealth"
          />
        </div>
        <!-- Recent Deployments Panel -->
        <div v-if="visibleDeployments.length > 0" class="deploy-panel">
          <div class="deploy-panel-header" @click="deployPanelOpen = !deployPanelOpen">
            <span class="deploy-panel-title">
              <svg class="deploy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Recent deployments ({{ visibleDeployments.length }} in view)
            </span>
            <svg :class="{ 'chevron-open': deployPanelOpen }" class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          <div v-if="deployPanelOpen" class="deploy-list">
            <div v-for="evt in visibleDeployments" :key="evt.hash" class="deploy-row" @click="focusDeploy(evt)">
              <code class="deploy-hash">{{ evt.hash }}</code>
              <span class="deploy-time">{{ formatDeployTime(evt.timestamp) }}</span>
              <span class="deploy-msg">{{ evt.message }}</span>
            </div>
          </div>
        </div>

        <div class="charts-row">
          <DataTable
            title="Latest device health"
            :data="latestDeviceHealth"
            :columns="deviceHealthColumns"
            :loading="loading.deviceHealth"
          />
        </div>
      </section>

      <!-- Device Risk Matrix -->
      <section class="section">
        <SectionHeader title="Host risk matrix" caption="Combined security posture + health data — sorted by risk" />
        <DataTable
          title=""
          :data="riskMatrix"
          :columns="riskColumns"
          :loading="loading.risk"
        />
      </section>

      <!-- Process Sequence View -->
      <section class="section">
        <SectionHeader title="Process activity timeline" caption="Horizontal bars show when top processes were active" />
        <SequenceChart
          title="Top process activity"
          :data="sequenceData"
          :categories="sequenceCategories"
          :timeLabels="sequenceTimeLabels"
          :loading="loading.sequence"
        />
      </section>

      <!-- Top Processes Section -->
      <section class="section">
        <SectionHeader title="Top processes" />
        <div class="charts-row two-col">
          <BarChart
            title="Top processes by memory (MB)"
            :data="topProcessesByMemory"
            :loading="loading.processes"
            nameKey="process_name"
            valueKey="avg_mb"
          />
          <ChartCard title="Process distribution" :loading="loading.processes" :empty="!processDistribution.length">
            <BarList :data="processDistribution" nameKey="process_name" valueKey="count" :maxRows="8" :humanize="false" />
          </ChartCard>
        </div>
        <div class="charts-row two-col">
          <TimeSeriesChart
            title="Process memory trend (top 5)"
            :data="processTrend"
            :loading="loading.processes"
            xKey="time"
            yKey="avg_mb"
            :zoomable="true"
            :color="palette.purple"
          />
          <DataTable
            title="Recent process events"
            :data="recentProcesses"
            :columns="processColumns"
            :loading="loading.processes"
          />
        </div>
      </section>

      <!-- Audit Activity Heatmap -->
      <section class="section">
        <SectionHeader title="Admin activity" caption="Audit log activity heatmap — day vs hour" />
        <HeatmapChart
          title="Audit activity (day x hour)"
          :data="auditHeatmapData"
          :xLabels="auditHeatmapHours"
          :yLabels="auditHeatmapDays"
          :loading="loading.audit"
          :minValue="0"
          :maxValue="auditMaxActivity"
          :colorRange="[palette.ink5, palette.goodBg, palette.greenSoft, palette.good, palette.greenOver]"
          tooltipLabel="Activity"
        />
      </section>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { query } from '../services/api'
import { useTimeRange } from '../composables/useTimeRange'
import { useDrillFilter } from '../composables/useDrillFilter'
import { useFleetFilter } from '../composables/useFleetFilter'
import { displayHost } from '../composables/displayName'
import TimeRangeFilter from '../components/TimeRangeFilter.vue'
import DrillFilterBar from '../components/DrillFilterBar.vue'
import MetricCard from '../components/MetricCard.vue'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import MultiSeriesChart from '../components/MultiSeriesChart.vue'
import HeatmapChart from '../components/HeatmapChart.vue'
import SequenceChart from '../components/SequenceChart.vue'
import BarChart from '../components/BarChart.vue'
import ChartCard from '../components/base/ChartCard.vue'
import BarList from '../components/base/BarList.vue'
import DataTable from '../components/DataTable.vue'
import DeviceDetail from '../components/DeviceDetail.vue'
import GradeBadge from '../components/GradeBadge.vue'
import SparklineChart from '../components/SparklineChart.vue'
import DeviceCompare from '../components/DeviceCompare.vue'
import PlatformBenchmark from '../components/PlatformBenchmark.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import SegmentedControl from '../components/base/SegmentedControl.vue'
import BaseButton from '../components/base/BaseButton.vue'
import Chip from '../components/base/Chip.vue'
import Badge from '../components/base/Badge.vue'
import ScoreBar from '../components/base/ScoreBar.vue'
import { gradeColor, scoreBandColor } from '../composables/gradeColors'
import { palette, categorical, statusRamp } from '../composables/uiPalette'
import { usePlatformBenchmark } from '../composables/usePlatformBenchmark'
import { useWorkersCouncil } from '../composables/useWorkersCouncil'
import { useGitopsEvents } from '../composables/useGitopsEvents'
import dayjs from 'dayjs'

const { timeRangeHours } = useTimeRange()
const { wcMode, computeUsageSummary, computeBrowserBreakdown, getLicenseWasteApps } = useWorkersCouncil()
const { gitopsEvents, fetchGitopsEvents, eventsInRange, eventsAsChartMarkers } = useGitopsEvents()

// ─── Deployment panel state ─────────────────────────
const deployPanelOpen = ref(true)

function formatDeployTime(timestamp) {
  return dayjs(timestamp).format('HH:mm')
}

function focusDeploy(evt) {
  // Switch time range to 7d to ensure ±48h is visible, then let chart zoom handle the rest
  const evtTime = dayjs(evt.timestamp)
  const start = evtTime.subtract(48, 'hour').format('YYYY-MM-DD HH:mm:ss')
  const end = evtTime.add(48, 'hour').format('YYYY-MM-DD HH:mm:ss')
  // Find the xLabel indices for ±48h window and apply zoom
  const labels = healthTimeLabels.value
  if (!labels.length) return
  const startIdx = Math.max(0, labels.findIndex((_, i) => i >= 0) || 0)
  const endIdx = labels.length - 1
  // Compute percentage positions for dataZoom
  let zoomStart = 0, zoomEnd = 100
  for (let i = 0; i < labels.length; i++) {
    const marker = fleetHealthEvents.value.find(m => m.hash === evt.hash)
    if (marker) {
      const center = marker.xIndex
      const halfWindow = Math.min(24, Math.floor(labels.length / 4)) // ~48h worth of buckets
      zoomStart = Math.max(0, ((center - halfWindow) / labels.length) * 100)
      zoomEnd = Math.min(100, ((center + halfWindow) / labels.length) * 100)
      break
    }
  }
  // ECharts dataZoom will be controlled via the slider — set range via reactivity
  // For now, scroll to the chart section for visibility
  document.querySelector('.section h2')?.scrollIntoView({ behavior: 'smooth' })
}

const drill = useDrillFilter()
const { isFiltered, setDrill, clearDrill } = drill
const {
  filterParams, isFleetFiltered, heatmapMode, setOSFilter, setModelFilter
} = useFleetFilter()

// ─── Heatmap mode controls ──────────────────────────────
const heatmapModes = [
  { value: 'unhealthiest', label: 'Top 20 unhealthiest' },
  { value: 'by-os', label: 'By OS' },
  { value: 'by-model', label: 'By model' }
]

const error = ref(null)
const selectedDevice = ref(null)
const fleetServerUrl = 'https://fleet-dev.macadmin.me'

const selectDevice = (device) => {
  // In compare mode, clicking a device row sets it as Device B
  if (compareMode.value && compareRef.value && device.host_identifier) {
    compareRef.value.setDeviceB(device.host_identifier)
    return
  }
  selectedDevice.value = device
}

// ─── Loading states ──────────────────────────────────
const loading = ref({
  metrics: false,
  devices: false,
  deviceHealth: false,
  heatmap: false,
  processes: false,
  security: false,
  risk: false,
  sequence: false,
  audit: false,
  drill: false
})

// ═══════════════════════════════════════════════════════
//  OVERVIEW METRICS
// ═══════════════════════════════════════════════════════
const metrics = ref({ totalEvents: 0, deviceCount: 0, queryTypes: 0, p95Memory: '-' })

// ═══════════════════════════════════════════════════════
//  DEVICES
// ═══════════════════════════════════════════════════════
const devices = ref([])
const deviceColumns = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'serial_number', label: 'Serial number' },
  { key: 'os_name', label: 'OS' },
  { key: 'os_version', label: 'Version' },
  { key: 'last_seen', label: 'Last seen', type: 'datetime' }
]

// ═══════════════════════════════════════════════════════
//  HEATMAP
// ═══════════════════════════════════════════════════════
const heatmapData = ref([])
const heatmapHours = ref([])
const heatmapHosts = ref([])
const heatmapDeviceMap = ref({})

// ═��═���═══════════════════════════════════════════════════
//  FLEET-WIDE: DEVICE HEALTH
// ═══════════════════════════════════════════════════════
const healthTimeLabels = ref([])
const memoryValues = ref([])
const diskValues = ref([])
const memoryAnomalies = ref([])
const latestDeviceHealth = ref([])
const deviceHealthColumns = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'memory_percent', label: 'Memory %', type: 'number', tone: (v) => v == null ? null : (v >= 75 ? 'critical' : v >= 50 ? 'elevated' : v >= 25 ? 'fair' : 'good') },
  { key: 'memory_used_gb', label: 'Memory used (GB)', type: 'number' },
  { key: 'disk_percent', label: 'Disk %', type: 'number', tone: (v) => v == null ? null : (v >= 75 ? 'critical' : v >= 50 ? 'elevated' : v >= 25 ? 'fair' : 'good') },
  { key: 'disk_free_gb', label: 'Disk free (GB)', type: 'number' },
  { key: 'uptime_days', label: 'Uptime (days)', type: 'number' },
  { key: 'event_time', label: 'Time', type: 'datetime' }
]

const healthSeries = computed(() => [
  { name: 'Memory %', data: memoryValues.value, color: categorical[4] },
  { name: 'Disk %', data: diskValues.value, color: categorical[3] }
])

// GitOps deployment markers for fleet-wide health chart
const fleetHealthEvents = computed(() =>
  eventsAsChartMarkers(healthTimeLabels.value, eventsInRange(timeRangeHours.value, new Date().toISOString()))
)

// Visible deployments for the deployment list panel
const visibleDeployments = computed(() =>
  eventsInRange(timeRangeHours.value, new Date().toISOString())
)

// ═══════════════════════════════════════════════════════
//  FLEET-WIDE: RISK MATRIX
// ═══════════════════════════════════════════════════════
const riskMatrix = ref([])
const riskColumns = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'avg_mem', label: 'Avg memory %', type: 'number', tone: (v) => v == null ? null : (v >= 75 ? 'critical' : v >= 50 ? 'elevated' : v >= 25 ? 'fair' : 'good') },
  { key: 'avg_disk', label: 'Avg disk %', type: 'number', tone: (v) => v == null ? null : (v >= 75 ? 'critical' : v >= 50 ? 'elevated' : v >= 25 ? 'fair' : 'good') },
  { key: 'encrypted', label: 'Encrypted' },
  { key: 'firewall', label: 'Firewall' },
  { key: 'sip', label: 'SIP' },
  { key: 'risk_score', label: 'Risk score', type: 'number', tone: (v) => v == null ? null : (v >= 75 ? 'critical' : v >= 50 ? 'elevated' : v >= 25 ? 'fair' : 'good') }
]

// ═══════════════════════════════════════════════════════
//  FLEET-WIDE: PROCESS SEQUENCE
// ═══════════════════════════════════════════════════════
const sequenceData = ref([])
const sequenceCategories = ref([])
const sequenceTimeLabels = ref([])

// ═══════════════════════════════════════════════════════
//  FLEET-WIDE: PROCESSES
// ═══════════════════════════════════════════════════════
const topProcessesByMemory = ref([])
const processDistribution = ref([])
const recentProcesses = ref([])
const processTrend = ref([])
const processColumns = [
  { key: 'event_time', label: 'Time', type: 'datetime' },
  { key: 'hostname', label: 'Host' },
  { key: 'process_name', label: 'Process' },
  { key: 'memory_mb', label: 'Memory (MB)', type: 'number' },
  { key: 'pid', label: 'PID' },
  { key: 'state', label: 'State' }
]

// ═══════════════════════════════════════════════════════
//  FLEET-WIDE: SECURITY
// ═══════════════════════════════════════════════════════
const securityMetrics = ref({ encryptedCount: 0, secureBootCount: 0, firewallCount: 0, sipCount: 0, totalDevices: 0 })
const securityStatus = ref([])
const securityColumns = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'os_platform', label: 'Platform' },
  { key: 'os_version', label: 'OS Version' },
  { key: 'disk_encrypted', label: 'Encrypted' },
  { key: 'secure_boot_enabled', label: 'Secure boot' },
  { key: 'event_time', label: 'Last check', type: 'datetime' }
]

// ═══════════════════════════════════════════════════════
//  FLEET-WIDE: AUDIT HEATMAP
// ═══════════════════════════════════════════════════════
const auditHeatmapData = ref([])
const auditHeatmapHours = ref([])
const auditHeatmapDays = ref([])
const auditMaxActivity = ref(10)

// ═══════════════════════════════════════════════════════
//  DEVICE DRILL-DOWN STATE
// ═══════════════════════════════════════════════════════
const drillDeviceInfo = ref(null)
const drillLatest = ref({})
const drillSec = ref({})
const drillRiskScore = ref(0)
const drillHealthLabels = ref([])
const drillMemValues = ref([])
const drillDiskValues = ref([])
const drillAnomalies = ref([])
const drillTopProcesses = ref([])
const drillRecentProcesses = ref([])
const drillSequenceData = ref([])
const drillSequenceCategories = ref([])
const drillSequenceTimeLabels = ref([])

// ─── Device Experience Score & Software State ────────────────
const softwareFilter = ref('')   // '' | 'daily' | 'weekly' | 'monthly' | 'unused'
const drillScores = ref(null)
const drillScoreHistory = ref([])
const drillSoftwareApps = ref([])
const drillPatchHistory = ref([])

// ─── Comparison mode ─────────────────────────────────
const compareMode = ref(false)
const compareRef = ref(null)

// Platform benchmark for drill-down
const {
  benchmarkData: drillBenchmarks,
  lifecycleLabel: drillLifecycle,
  loading: drillBenchmarkLoading,
  activeCohort: drillBenchmarkCohort,
  fetchBenchmarks: fetchDrillBenchmarks,
  updateLifecycle: updateDrillLifecycle
} = usePlatformBenchmark()

function enterCompareFromDetail(hostId) {
  selectedDevice.value = null  // close detail panel
  // Enter drill-down with compare mode
  const device = devices.value.find(d => d.host_identifier === hostId)
  if (device) {
    setDrill(displayHost(device), hostId, null)
    fetchDeviceDrillDown(hostId)
  }
  compareMode.value = true
}

const drillProcessColumns = [
  { key: 'event_time', label: 'Time', type: 'datetime' },
  { key: 'process_name', label: 'Process' },
  { key: 'memory_mb', label: 'Memory (MB)', type: 'number' },
  { key: 'pid', label: 'PID' },
  { key: 'state', label: 'State' }
]

const drillHealthSeries = computed(() => [
  { name: 'Memory %', data: drillMemValues.value, color: categorical[4] },
  { name: 'Disk %', data: drillDiskValues.value, color: categorical[3] }
])

// GitOps deployment markers for device drill-down health chart
const drillHealthEvents = computed(() =>
  eventsAsChartMarkers(drillHealthLabels.value, eventsInRange(timeRangeHours.value, new Date().toISOString()))
)

// ─── Experience score helpers ─────────────────────────
const scoreCategories = computed(() => {
  const s = drillScores.value
  if (!s) return []
  return [
    { key: 'performance', label: 'Performance', value: s.performance_score },
    { key: 'device_health', label: 'Device health', value: s.device_health_score },
    { key: 'network', label: 'Network', value: s.network_score },
    { key: 'security', label: 'Security', value: s.security_score },
    { key: 'software', label: 'Software', value: s.software_score }
  ]
})

function catGrade(v) {
  if (v === null || v === undefined || v < 0) return '—'
  if (v >= 90) return 'A'
  if (v >= 75) return 'B'
  if (v >= 60) return 'C'
  if (v >= 40) return 'D'
  return 'F'
}

const filteredSoftwareApps = computed(() => {
  const apps = drillSoftwareApps.value
  if (!softwareFilter.value) return apps.slice(0, 20)
  if (softwareFilter.value === 'unused') {
    return apps.filter(a => a.usage_category === 'stale' || a.usage_category === 'never')
  }
  return apps.filter(a => a.usage_category === softwareFilter.value)
})

function toggleSoftwareFilter(cat) {
  softwareFilter.value = softwareFilter.value === cat ? '' : cat
}

// Segmented-control options for the software usage filter (labels carry counts)
const usageFilterOptions = computed(() => {
  const apps = drillSoftwareApps.value
  const count = c => apps.filter(a => a.usage_category === c).length
  return [
    { value: 'daily', label: count('daily') + ' daily' },
    { value: 'weekly', label: count('weekly') + ' weekly' },
    { value: 'monthly', label: count('monthly') + ' monthly' },
    { value: 'unused', label: apps.filter(a => a.usage_category === 'stale' || a.usage_category === 'never').length + ' unused' }
  ]
})

function sentenceCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function usageTone(cat) {
  return { daily: 'good', weekly: 'info', monthly: 'fair', stale: 'elevated', never: 'critical' }[cat] || 'neutral'
}

// ─── Workers Council computed properties ──────────────────────
const wcSoftwareSummary = computed(() => computeUsageSummary(drillSoftwareApps.value))
const wcBrowserBreakdown = computed(() => computeBrowserBreakdown(drillSoftwareApps.value))
const wcLicenseWaste = computed(() => getLicenseWasteApps(drillSoftwareApps.value))

const lifecycleTone = computed(() => {
  const map = {
    'Top performer': 'good',
    'Healthy': 'info',
    'Needs attention': 'fair',
    'Underperforming': 'elevated',
    'End of life candidate': 'critical'
  }
  return map[drillLifecycle.value] || 'neutral'
})

function patchLagTone(days) {
  if (days <= 3) return 'good'
  if (days <= 7) return 'info'
  if (days <= 14) return 'fair'
  return 'critical'
}

// ═══════════════════════════════════════════════════════
//  HEATMAP CLICK → DEVICE DRILL-DOWN
// ═══════════════════════════════════════════════════════
function onHeatmapClick({ xLabel, yLabel }) {
  if (heatmapMode.value === 'by-os') {
    setOSFilter(yLabel)
    return
  }
  if (heatmapMode.value === 'by-model') {
    setModelFilter(yLabel)
    return
  }
  // Default: unhealthiest mode — drill into device
  const hostname = yLabel
  const deviceInfo = heatmapDeviceMap.value[hostname]
  if (!deviceInfo) return

  // If in compare mode, clicking heatmap sets Device B
  if (compareMode.value && compareRef.value) {
    compareRef.value.setDeviceB(deviceInfo.host_identifier)
    return
  }

  const hourStr = deviceInfo.hourMap?.[xLabel] || null
  setDrill(hostname, deviceInfo.host_identifier, hourStr)
  fetchDeviceDrillDown(deviceInfo.host_identifier)
}

// ═══════════════════════════════════════════════════════
//  FETCH: DEVICE DRILL-DOWN (all device-specific queries)
// ═══════════════════════════════════════════════════════
async function fetchDeviceDrillDown(hostId) {
  loading.value.drill = true
  error.value = null
  softwareFilter.value = ''

  const timeRange = timeRangeHours.value

  try {
    const [healthTs, latest, sec, topProcs, recentProcs, seqData, scores, scoreHist, appUsage, patches] = await Promise.all([
      // 1) Health time-series for this device
      query('health.device_timeseries', { timeRange, hostIdentifier: hostId }),
      // 2) Latest health snapshot
      query('health.device_latest', { timeRange, hostIdentifier: hostId }),
      // 3) Latest security posture
      query('security.device_posture', { timeRange, hostIdentifier: hostId }),
      // 4) Top processes for this device
      query('processes.top', { timeRange, hostIdentifier: hostId, limit: 10 }),
      // 5) Recent processes for this device
      query('processes.recent', { timeRange, hostIdentifier: hostId, limit: 30 }),
      // 6) Process sequence for this device
      query('processes.sequence', { timeRange, hostIdentifier: hostId }),
      // 7) Device experience scores (latest)
      query('scores.device_latest', { hostIdentifier: hostId }),
      // 8) Score history (30-day sparkline)
      query('scores.device_sparkline', { hostIdentifier: hostId }),
      // 9) Software usage for this device
      query('software.device_apps', { hostIdentifier: hostId }),
      // 10) Patch history for this device
      query('software.device_patches', { hostIdentifier: hostId, limit: 20 })
    ])

    // Device info from already-loaded devices table
    drillDeviceInfo.value = devices.value.find(d => d.host_identifier === hostId) || null

    // Latest health
    drillLatest.value = latest[0] || {}

    // Security
    drillSec.value = sec[0] || {}

    // Risk score
    const mem = parseFloat(drillLatest.value.memory_percent) || 0
    const enc = drillSec.value.encrypted
    const fw = drillSec.value.firewall
    drillRiskScore.value = (enc === '0' ? 30 : 0) + (fw === '0' ? 20 : 0) + (mem > 85 ? Math.round(mem - 85) : 0)

    // Health time-series
    drillHealthLabels.value = healthTs.map(r => r.time)
    drillMemValues.value = healthTs.map(r => r.avg_memory)
    drillDiskValues.value = healthTs.map(r => r.avg_disk)

    // Anomaly detection: memory jump >15 points between hours
    const anomalies = []
    for (let i = 1; i < healthTs.length; i++) {
      const prev = healthTs[i - 1].avg_memory
      const curr = healthTs[i].avg_memory
      if (prev != null && curr != null && Math.abs(curr - prev) > 15) {
        anomalies.push({ xIndex: i, value: curr, label: `Jump: ${(curr - prev).toFixed(1)}` })
      }
    }
    drillAnomalies.value = anomalies

    // Top processes
    drillTopProcesses.value = topProcs
    drillRecentProcesses.value = recentProcs

    // Process sequence (Gantt bars)
    buildSequenceSpans(seqData)

    // Experience scores
    drillScores.value = scores[0] || null
    drillScoreHistory.value = scoreHist.map(r => r.score)
    drillSoftwareApps.value = appUsage
    drillPatchHistory.value = patches

    // Platform benchmarks (fire-and-forget, non-blocking)
    if (drillScores.value) {
      fetchDrillBenchmarks(
        hostId,
        drillScores.value.os_name || '',
        drillScores.value.hardware_model || '',
        drillScores.value.ram_tier || ''
      ).then(() => updateDrillLifecycle(drillScores.value))
    }

  } catch (e) {
    error.value = `Failed to fetch device data: ${e.message}`
  } finally {
    loading.value.drill = false
  }
}

// Build Gantt spans from process sequence data
function buildSequenceSpans(data) {
  const timesSet = []
  const catsSet = []
  for (const row of data) {
    if (!timesSet.includes(row.hour_label)) timesSet.push(row.hour_label)
    if (!catsSet.includes(row.process_name)) catsSet.push(row.process_name)
  }
  timesSet.sort()

  const spans = []
  const byProcess = {}
  for (const row of data) {
    if (!byProcess[row.process_name]) byProcess[row.process_name] = []
    byProcess[row.process_name].push({
      idx: timesSet.indexOf(row.hour_label),
      avg_mb: row.avg_mb
    })
  }

  for (const [proc, hours] of Object.entries(byProcess)) {
    hours.sort((a, b) => a.idx - b.idx)
    let spanStart = hours[0]
    let spanEnd = hours[0]
    for (let i = 1; i < hours.length; i++) {
      if (hours[i].idx === spanEnd.idx + 1) {
        spanEnd = hours[i]
      } else {
        spans.push({ category: proc, start: spanStart.idx, end: spanEnd.idx + 1, label: proc, value: spanEnd.avg_mb, tooltip: `Avg: ${spanEnd.avg_mb} MB` })
        spanStart = hours[i]
        spanEnd = hours[i]
      }
    }
    spans.push({ category: proc, start: spanStart.idx, end: spanEnd.idx + 1, label: proc, value: spanEnd.avg_mb, tooltip: `Avg: ${spanEnd.avg_mb} MB` })
  }

  drillSequenceTimeLabels.value = timesSet
  drillSequenceCategories.value = catsSet
  drillSequenceData.value = spans
}

// ═════════════════════����════════════════════════════════
//  FLEET-WIDE FETCH FUNCTIONS
// ═══════════════════════════════════════════════════════

async function fetchMetrics() {
  loading.value.metrics = true
  const timeRange = timeRangeHours.value
  const fp = filterParams.value
  try {
    const [health, procs] = await Promise.all([
      query('health.summary', { timeRange, ...fp }),
      query('processes.event_count', { timeRange, ...fp })
    ])
    const h = health[0] || {}
    metrics.value = {
      totalEvents: (Number(h.cnt) || 0) + (Number(procs[0]?.cnt) || 0),
      deviceCount: h.devices || 0,
      queryTypes: 3,
      p95Memory: h.p95_mem ?? '-'
    }
  } catch (e) {
    error.value = `Failed to fetch metrics: ${e.message}`
  } finally {
    loading.value.metrics = false
  }
}

async function fetchDevices() {
  loading.value.devices = true
  try {
    devices.value = await query('devices.list', { ...filterParams.value })
  } catch (e) {
    error.value = `Failed to fetch devices: ${e.message}`
  } finally {
    loading.value.devices = false
  }
}

async function fetchHeatmap() {
  loading.value.heatmap = true
  try {
    if (heatmapMode.value === 'by-os') {
      await fetchHeatmapByOS()
    } else if (heatmapMode.value === 'by-model') {
      await fetchHeatmapByModel()
    } else {
      await fetchHeatmapUnhealthiest()
    }
  } catch (e) {
    error.value = `Failed to fetch heatmap: ${e.message}`
  } finally {
    loading.value.heatmap = false
  }
}

async function fetchHeatmapUnhealthiest() {
  const timeRange = timeRangeHours.value
  const fp = filterParams.value

  const data = await query('health.heatmap_unhealthiest', { timeRange, ...fp })

  const hoursSet = [], hostsSet = [], deviceMap = {}
  for (const row of data) {
    if (!hoursSet.includes(row.hour_label)) hoursSet.push(row.hour_label)
    const label = displayHost(row)
    if (!hostsSet.includes(label)) {
      hostsSet.push(label)
      deviceMap[label] = { host_identifier: row.host_identifier, hourMap: {} }
    }
  }
  hoursSet.sort()

  const heatData = []
  for (const row of data) {
    const label = displayHost(row)
    const xIdx = hoursSet.indexOf(row.hour_label)
    const yIdx = hostsSet.indexOf(label)
    if (xIdx >= 0 && yIdx >= 0) {
      heatData.push([xIdx, yIdx, row.health_score])
      if (deviceMap[label]) deviceMap[label].hourMap[row.hour_label] = row.hour
    }
  }

  heatmapHours.value = hoursSet
  heatmapHosts.value = hostsSet
  heatmapData.value = heatData
  heatmapDeviceMap.value = deviceMap
}

async function fetchHeatmapByOS() {
  const timeRange = timeRangeHours.value
  const fp = filterParams.value

  const data = await query('health.heatmap_by_os', { timeRange, ...fp })

  const hoursSet = [], osSet = []
  for (const row of data) {
    if (!hoursSet.includes(row.hour_label)) hoursSet.push(row.hour_label)
    if (!osSet.includes(row.os_name)) osSet.push(row.os_name)
  }
  hoursSet.sort()

  const heatData = data.map(row => [
    hoursSet.indexOf(row.hour_label),
    osSet.indexOf(row.os_name),
    row.health_score
  ]).filter(([x, y]) => x >= 0 && y >= 0)

  heatmapHours.value = hoursSet
  heatmapHosts.value = osSet
  heatmapData.value = heatData
  heatmapDeviceMap.value = {}
}

async function fetchHeatmapByModel() {
  const timeRange = timeRangeHours.value
  const fp = filterParams.value

  const data = await query('health.heatmap_by_model', { timeRange, ...fp })

  const hoursSet = [], modelSet = []
  for (const row of data) {
    if (!hoursSet.includes(row.hour_label)) hoursSet.push(row.hour_label)
    if (!modelSet.includes(row.hardware_model)) modelSet.push(row.hardware_model)
  }
  hoursSet.sort()

  const heatData = data.map(row => [
    hoursSet.indexOf(row.hour_label),
    modelSet.indexOf(row.hardware_model),
    row.health_score
  ]).filter(([x, y]) => x >= 0 && y >= 0)

  heatmapHours.value = hoursSet
  heatmapHosts.value = modelSet
  heatmapData.value = heatData
  heatmapDeviceMap.value = {}
}

async function fetchDeviceHealth() {
  loading.value.deviceHealth = true
  const timeRange = timeRangeHours.value
  const fp = filterParams.value
  try {
    const [combined, latest] = await Promise.all([
      query('health.timeseries', { timeRange, ...fp }),
      query('health.latest_per_device', { timeRange, ...fp })
    ])
    healthTimeLabels.value = combined.map(r => r.time)
    memoryValues.value = combined.map(r => r.avg_memory)
    diskValues.value = combined.map(r => r.avg_disk)

    const anomalies = []
    for (let i = 1; i < combined.length; i++) {
      const prev = combined[i - 1].avg_memory, curr = combined[i].avg_memory
      if (prev != null && curr != null && Math.abs(curr - prev) > 15)
        anomalies.push({ xIndex: i, value: curr, label: `Jump: ${(curr - prev).toFixed(1)}` })
    }
    memoryAnomalies.value = anomalies
    latestDeviceHealth.value = latest
  } catch (e) {
    error.value = `Failed to fetch device health: ${e.message}`
  } finally {
    loading.value.deviceHealth = false
  }
}

async function fetchRiskMatrix() {
  loading.value.risk = true
  const timeRange = timeRangeHours.value
  const fp = filterParams.value
  try {
    riskMatrix.value = await query('health.risk_matrix', { timeRange, ...fp })
  } catch (e) {
    error.value = `Failed to fetch risk matrix: ${e.message}`
  } finally {
    loading.value.risk = false
  }
}

async function fetchSequence() {
  loading.value.sequence = true
  const timeRange = timeRangeHours.value
  const fp = filterParams.value
  try {
    const data = await query('processes.sequence', { timeRange, ...fp })
    buildFleetSequenceSpans(data)
  } catch (e) {
    error.value = `Failed to fetch sequence: ${e.message}`
  } finally {
    loading.value.sequence = false
  }
}

function buildFleetSequenceSpans(data) {
  const timesSet = [], catsSet = []
  for (const row of data) {
    if (!timesSet.includes(row.hour_label)) timesSet.push(row.hour_label)
    if (!catsSet.includes(row.process_name)) catsSet.push(row.process_name)
  }
  timesSet.sort()

  const spans = [], byProcess = {}
  for (const row of data) {
    if (!byProcess[row.process_name]) byProcess[row.process_name] = []
    byProcess[row.process_name].push({ idx: timesSet.indexOf(row.hour_label), avg_mb: row.avg_mb })
  }
  for (const [proc, hours] of Object.entries(byProcess)) {
    hours.sort((a, b) => a.idx - b.idx)
    let s = hours[0], e = hours[0]
    for (let i = 1; i < hours.length; i++) {
      if (hours[i].idx === e.idx + 1) { e = hours[i] }
      else { spans.push({ category: proc, start: s.idx, end: e.idx + 1, label: proc, value: e.avg_mb, tooltip: `Avg: ${e.avg_mb} MB` }); s = hours[i]; e = hours[i] }
    }
    spans.push({ category: proc, start: s.idx, end: e.idx + 1, label: proc, value: e.avg_mb, tooltip: `Avg: ${e.avg_mb} MB` })
  }
  sequenceTimeLabels.value = timesSet
  sequenceCategories.value = catsSet
  sequenceData.value = spans
}

async function fetchProcesses() {
  loading.value.processes = true
  const timeRange = timeRangeHours.value
  const fp = filterParams.value
  try {
    const [topMemory, distribution, recent, trend] = await Promise.all([
      query('processes.top', { timeRange, ...fp, limit: 10 }),
      query('processes.distribution', { timeRange, ...fp }),
      query('processes.recent', { timeRange, ...fp, limit: 50 }),
      query('processes.trend', { timeRange, ...fp })
    ])
    topProcessesByMemory.value = topMemory
    processDistribution.value = distribution
    recentProcesses.value = recent
    processTrend.value = trend
  } catch (e) {
    error.value = `Failed to fetch processes: ${e.message}`
  } finally {
    loading.value.processes = false
  }
}

async function fetchSecurity() {
  loading.value.security = true
  const timeRange = timeRangeHours.value
  const fp = filterParams.value
  try {
    const [stats, status] = await Promise.all([
      query('security.stats', { timeRange, ...fp }),
      query('security.status_table', { timeRange, ...fp })
    ])
    if (stats[0]) {
      securityMetrics.value = {
        totalDevices: stats[0].total || 0, encryptedCount: stats[0].encrypted || 0,
        secureBootCount: stats[0].secure_boot || 0, firewallCount: stats[0].firewall || 0, sipCount: stats[0].sip || 0
      }
    }
    securityStatus.value = status
  } catch (e) {
    error.value = `Failed to fetch security data: ${e.message}`
  } finally {
    loading.value.security = false
  }
}

async function fetchAuditHeatmap() {
  loading.value.audit = true
  const timeRange = timeRangeHours.value
  try {
    const data = await query('audit.heatmap', { timeRange })
    const hoursSet = [], daysSet = []
    let maxCount = 1
    for (const row of data) {
      if (!hoursSet.includes(row.hour)) hoursSet.push(row.hour)
      if (!daysSet.includes(row.day)) daysSet.push(row.day)
      const c = Number(row.activity_count) || 0
      if (c > maxCount) maxCount = c
    }
    hoursSet.sort(); daysSet.sort()
    auditHeatmapHours.value = hoursSet
    auditHeatmapDays.value = daysSet
    auditHeatmapData.value = data.map(row => [hoursSet.indexOf(row.hour), daysSet.indexOf(row.day), Number(row.activity_count) || 0])
    auditMaxActivity.value = maxCount
  } catch (e) {
    auditHeatmapData.value = []; auditHeatmapHours.value = []; auditHeatmapDays.value = []
  } finally {
    loading.value.audit = false
  }
}

// ═══════════════════════════════════════════════════════
//  ORCHESTRATION
// ═══════════════════════════════════════════════════════

async function fetchFleetData() {
  error.value = null
  await Promise.all([
    fetchDeviceHealth(), fetchProcesses(), fetchSecurity(),
    fetchRiskMatrix(), fetchSequence()
  ])
}

async function fetchAllData() {
  error.value = null
  await Promise.all([
    fetchMetrics(), fetchDevices(), fetchHeatmap(),
    fetchDeviceHealth(), fetchProcesses(), fetchSecurity(),
    fetchRiskMatrix(), fetchSequence(), fetchAuditHeatmap()
  ])
}

// Track whether fleet filter caused the drill clear (prevents double-fetch)
let fleetFilterChanging = false

// When drill is cleared manually → reload fleet-wide data
watch(isFiltered, (newVal, oldVal) => {
  if (!newVal && oldVal && !fleetFilterChanging) fetchFleetData()
})

// Fleet filter changes → clear drill and re-fetch everything
watch(filterParams, () => {
  fleetFilterChanging = true
  clearDrill()
  fetchAllData()
  fleetFilterChanging = false
}, { deep: true })

// Heatmap mode changes → re-fetch heatmap only
watch(heatmapMode, () => {
  fetchHeatmap()
})

watch(timeRangeHours, () => {
  clearDrill()
  fetchAllData()
})

onMounted(() => {
  fetchAllData()
  fetchGitopsEvents()
})
</script>

<style scoped>
.dashboard {
  max-width: 1440px;
}

/* Sections stack their own blocks; the page-stack global handles inter-section gaps */
.section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}

/* ─── Heatmap Controls ─────────────────────── */
.heatmap-controls {
  display: flex;
  align-items: center;
  gap: var(--pad-medium);
}

/* ─── Device Deep Dive ──────────────────────── */
.device-info-chips {
  display: flex;
  gap: var(--pad-small);
  flex-wrap: wrap;
}

/* ─── Security Cards ────────────────────────── */
.security-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--pad-medium);
}

.security-card {
  background: var(--fleet-white);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  text-align: center;
  border: 1px solid var(--fleet-black-10);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.security-card:hover {
  border-color: var(--fleet-black-25);
  box-shadow: var(--shadow-sm);
}

.security-card.good {
  background: var(--fleet-status-success-light);
  border-color: var(--fleet-status-success-border);
}

.security-card.bad {
  background: var(--fleet-status-error-light);
  border-color: var(--status-critical-bg);
}

.sec-icon {
  width: 32px;
  height: 32px;
  margin: 0 auto 9px;
  color: var(--fleet-black-50);
}

.security-card.good .sec-icon { color: var(--status-good); }
.security-card.bad .sec-icon { color: var(--fleet-status-error); }

.sec-label {
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  font-weight: 500;
  margin-bottom: 4px;
}

.sec-status {
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
}

.security-card.good .sec-status { color: var(--status-good); }
.security-card.bad .sec-status { color: var(--fleet-status-error); }

/* ─── Responsive ────────────────────────────── */
@media (max-width: 1024px) {
  .security-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 768px) {
  .security-grid { grid-template-columns: 1fr; }
  .software-patch-grid { grid-template-columns: 1fr; }
  .score-hero { flex-wrap: wrap; }
}

/* ─── Drill header with compare button ────────────── */
.drill-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ─── Experience Score Section ────────────────────── */
.score-overview {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
}

.score-hero {
  display: flex;
  align-items: center;
  gap: var(--pad-large);
  margin-bottom: var(--pad-large);
  padding-bottom: var(--pad-large);
  border-bottom: 1px solid var(--fleet-black-10);
}

.score-grade {
  font-size: 47px;
  font-weight: 700;
  line-height: 1;
  color: var(--fleet-black-33);
}

.score-grade.grade-a { color: var(--fleet-success); }
.score-grade.grade-b { color: var(--status-good); }
.score-grade.grade-c { color: var(--fleet-warning); }
.score-grade.grade-d { color: var(--fleet-ui-orange); }
.score-grade.grade-f { color: var(--fleet-error); }

.score-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.score-number {
  font-family: var(--font-body);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--fleet-black);
}

.score-meta {
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  display: flex;
  gap: 11px;
}

.score-sparkline {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.sparkline-label {
  font-size: 10px;
  color: var(--fleet-black-33);
}

.score-categories {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.score-cat-row {
  display: flex;
  align-items: center;
  gap: 11px;
}

.cat-label {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  font-weight: 500;
  min-width: 120px;
}

.cat-bar {
  flex: 1;
}

.cat-value {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  min-width: 28px;
  text-align: right;
}

/* ─── Lifecycle Badge Inline ─────────────────── */
.lifecycle-badge {
  margin-left: 9px;
  vertical-align: middle;
}

/* ─── Benchmark Section ──────────────────────── */
.benchmark-section {
  margin-top: var(--pad-large);
  padding-top: var(--pad-large);
  border-top: 1px solid var(--fleet-black-10);
}

.benchmark-section h4 {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--fleet-black);
  margin-bottom: var(--pad-medium);
}

/* ─── Software & Patch Section ────────────────────── */
.software-patch-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--pad-large);
}

.sw-panel {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  box-shadow: var(--box-shadow);
}

.sw-panel h3 {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--fleet-black);
  margin-bottom: var(--pad-medium);
}

.patch-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.patch-event {
  padding: 7px 0;
  border-bottom: 1px solid var(--fleet-black-5);
}

.patch-event:last-child {
  border-bottom: none;
}

.patch-event-header {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 4px;
}

.patch-sw-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
}

.patch-event-detail {
  display: flex;
  align-items: center;
  gap: 11px;
}

.patch-versions {
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  color: var(--fleet-black-50);
}

.usage-summary {
  margin-bottom: var(--pad-medium);
}

.filter-active-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  margin-bottom: 7px;
  padding: 4px 0;
}

.app-usage-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 400px;
  overflow-y: auto;
}

.app-usage-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 0;
  border-bottom: 1px solid var(--fleet-black-5);
}

.app-usage-row:last-child { border-bottom: none; }

.app-usage-name {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
}

.app-usage-ver {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}

.app-usage-days {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-33);
  min-width: 32px;
  text-align: right;
}

/* ─── Workers Council Mode Styles ────────────── */
.wc-panel {
  border-color: var(--status-good-bg);
  background: var(--fleet-accent-green-light);
}

.wc-aggregate-card {
  margin-bottom: var(--pad-medium);
}

.wc-aggregate-total {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--status-good-text);
  margin-bottom: 7px;
}

.wc-category-pills {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.wc-browser-section, .wc-license-section {
  margin-top: var(--pad-medium);
  padding-top: var(--pad-medium);
  border-top: 1px solid var(--status-good-bg);
}

.wc-browser-section h4, .wc-license-section h4 {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--status-good-text);
  margin: 0 0 7px 0;
}

/* Slim stacked-distribution strip (mirrors the mini-distribution pattern) */
.wc-browser-bar {
  display: flex;
  height: 12px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--fleet-black-5);
}

.wc-browser-segment {
  min-width: 0;
  transition: width 300ms ease-out;
}

.wc-browser-segment:nth-child(1) { background: var(--status-good); }
.wc-browser-segment:nth-child(2) { background: var(--status-good-soft); }
.wc-browser-segment:nth-child(3) { background: var(--fleet-status-success-border); }
.wc-browser-segment:nth-child(4) { background: var(--status-good-bg); }
.wc-browser-segment:nth-child(5) { background: var(--fleet-black-10); }

.wc-browser-legend {
  display: flex;
  gap: 11px;
  flex-wrap: wrap;
  margin-top: 5px;
}

.wc-legend-item {
  font-size: 10px;
  color: var(--status-good-text);
  font-weight: 500;
}

.wc-license-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.wc-license-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 0;
  border-bottom: 1px solid var(--status-good-bg);
}

.wc-license-row:last-child { border-bottom: none; }

.wc-license-name {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
}

.wc-license-days {
  font-size: var(--font-size-xs);
  color: var(--fleet-ui-orange);
  font-weight: 600;
}

.wc-hidden-section {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: var(--fleet-accent-green-light);
  border: 1px solid var(--status-good-bg);
  border-radius: var(--radius-large);
  padding: 18px 14px;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--status-good-text);
}

.wc-hidden-section svg {
  stroke: currentColor;
  flex-shrink: 0;
}

.wc-no-license-risk {
  font-size: var(--font-size-sm);
  color: var(--status-good-text);
  margin-top: var(--pad-medium);
  padding-top: var(--pad-medium);
  border-top: 1px solid var(--status-good-bg);
}

/* ─── Deployment Panel ──────────────────────────── */
.deploy-panel {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  margin-top: var(--pad-medium);
  box-shadow: var(--box-shadow);
  overflow: hidden;
}

.deploy-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--pad-small) var(--pad-medium);
  cursor: pointer;
  user-select: none;
  background: var(--info-tint-soft);
  border-bottom: 1px solid var(--fleet-black-10);
}

.deploy-panel-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black-75);
}

.deploy-icon {
  color: var(--fleet-vibrant-blue);
}

.chevron {
  transition: transform 0.2s;
}

.chevron-open {
  transform: rotate(180deg);
}

.deploy-list {
  max-height: 200px;
  overflow-y: auto;
}

.deploy-row {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  padding: 5px var(--pad-medium);
  font-size: var(--font-size-sm);
  border-bottom: 1px solid var(--fleet-black-10);
  cursor: pointer;
  transition: background 0.15s;
}

.deploy-row:last-child {
  border-bottom: none;
}

.deploy-row:hover {
  background: var(--info-tint-soft);
}

.deploy-hash {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fleet-vibrant-blue);
  background: var(--info-tint);
  padding: 1px 5px;
  border-radius: var(--radius);
  flex-shrink: 0;
}

.deploy-time {
  color: var(--fleet-black-50);
  flex-shrink: 0;
  min-width: 40px;
}

.deploy-msg {
  color: var(--fleet-black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
