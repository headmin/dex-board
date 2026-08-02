<template>
  <div class="page-stack styleguide">
    <PageHeader title="Style guide" subtitle="Living reference for the DEX UI system — every primitive, rendered to spec">
      <template #actions>
        <BaseButton variant="primary" @click="modalOpen = true">Open modal</BaseButton>
      </template>
    </PageHeader>

    <!-- Buttons -->
    <ChartCard title="Buttons">
      <div class="demo-row">
        <BaseButton variant="primary">Primary action</BaseButton>
        <BaseButton variant="secondary">Secondary</BaseButton>
        <BaseButton variant="subdued">Subdued</BaseButton>
        <BaseButton variant="link">Link button</BaseButton>
        <BaseButton variant="primary" size="small">Small primary</BaseButton>
        <BaseButton variant="secondary" size="small">Small secondary</BaseButton>
        <BaseButton variant="primary" disabled>Disabled</BaseButton>
        <IconButton label="Close">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
        </IconButton>
      </div>
    </ChartCard>

    <!-- Inputs -->
    <ChartCard title="Inputs & selects">
      <div class="demo-row">
        <BaseInput v-model="inputVal" placeholder="Hostname, serial, model…" style="max-width: 220px" />
        <SearchInput v-model="searchVal" placeholder="Search hosts…" style="max-width: 220px" />
        <BaseSelect v-model="selectVal" :options="['All fleets', 'Workstations', 'Servers']" style="max-width: 180px" />
        <BaseInput v-model="inputVal" placeholder="Disabled" disabled style="max-width: 140px" />
      </div>
    </ChartCard>

    <!-- Toggles & tabs -->
    <ChartCard title="Segmented control & tabs">
      <div class="demo-col">
        <SegmentedControl v-model="segVal" :options="['CPU', 'Model', 'RAM', 'Swap']" />
        <Tabs v-model="tabVal" :tabs="[{ value: 'hosts', label: 'Hosts', count: 78 }, { value: 'software', label: 'Software', count: 141 }, { value: 'reports', label: 'Reports' }]" />
        <Tabs v-model="tabVal" variant="underline" :tabs="[{ value: 'hosts', label: 'Hosts' }, { value: 'software', label: 'Software' }, { value: 'reports', label: 'Reports' }]" />
      </div>
    </ChartCard>

    <!-- Chips & badges -->
    <ChartCard title="Chips & badges">
      <div class="demo-row">
        <Chip label="cpu" value="apple_m4" />
        <Chip label="ram" value="16gb" />
        <Chip tone="critical" label="swap" value="severe" />
        <Chip tone="good" label="battery" value="good (100%)" />
        <Chip tone="fair" label="os health" value="acceptable" />
        <Chip tone="elevated" label="uptime" value="21.5d (stale_14d)" />
        <Chip tone="info" label="network" value="vpn_active" />
        <Chip tone="neutral" label="macos" value="26.5.1" />
      </div>
      <div class="demo-row" style="margin-top: 10px">
        <Badge label="Neutral" />
        <Badge tone="good" label="Healthy" />
        <Badge tone="fair" label="Pending" />
        <Badge tone="elevated" label="Degraded" />
        <Badge tone="critical" label="Failing" />
        <Badge tone="info" label="Info" />
        <GradeBadge grade="A" /><GradeBadge grade="B" /><GradeBadge grade="C" /><GradeBadge grade="D" /><GradeBadge grade="F" />
      </div>
    </ChartCard>

    <!-- Bars -->
    <ChartCard title="Bars — ScoreBar (comparative, trackless) vs GaugeBar (utilization, tracked)">
      <div class="bar-demo" v-for="row in scoreRows" :key="row.name">
        <span class="bar-demo__label">{{ row.name }}</span>
        <ScoreBar :value="row.score" />
        <GradeBadge :grade="row.grade" />
        <span class="bar-demo__score">{{ row.score }}</span>
      </div>
      <div style="margin-top: 18px; max-width: 560px">
        <div class="gauge-caption"><span>RAM utilization</span><span class="gauge-caption__val">3.2 GB used of 24 GB (13.5%)</span></div>
        <GaugeBar :value="13.5" :marker="56.7" />
        <div class="gauge-caption" style="margin-top: 14px"><span>High pressure host</span><span class="gauge-caption__val" style="color: var(--status-critical)">21.9 GB used of 24 GB (91%)</span></div>
        <GaugeBar :value="91" />
      </div>
    </ChartCard>

    <!-- Metric tiles -->
    <SectionHeader title="Metric tiles" caption="Off-white fill, 17px value, 11px label — per the device-card mockup" />
    <div class="metrics-row five-col">
      <MetricCard label="MTTP" value="1.3d" />
      <MetricCard label="SNR" :value="0" />
      <MetricCard label="Quality" value="Fair" />
      <MetricCard label="TX rate" :value="144" :trend="4" />
      <MetricCard label="Uptime" value="6d 3h" :trend="-2" />
    </div>

    <!-- Table -->
    <ChartCard title="DataTable — tone cells, density, filter">
      <SearchInput v-model="tableFilter" placeholder="Filter hosts…" style="max-width: 240px; margin-bottom: 12px" />
      <DataTable :data="tableRows" :columns="tableCols" :filter="tableFilter" defaultSortKey="score" :defaultSortAsc="false" />
    </ChartCard>

    <!-- Empty state -->
    <EmptyState title="No hosts match your filters" info="Try a different platform or clear the search. New hosts appear within one collection interval.">
      <template #actions>
        <BaseButton variant="primary">Clear filters</BaseButton>
        <BaseButton variant="secondary">View setup guide</BaseButton>
      </template>
    </EmptyState>

    <!-- Drawer -->
    <Drawer title="Allen's MacBook Pro" @close="() => {}">
      <template #meta><Badge tone="critical" label="Inactive · 10d ago" /></template>
      <template #subtitle>Mac17,2 · Apple M5 · 16 GB RAM</template>
      <template #actions><BaseButton variant="primary" size="small">Open in Fleet</BaseButton></template>
      <div class="demo-row">
        <Chip label="cpu" value="apple_m5" />
        <Chip tone="critical" label="swap" value="severe" />
        <Chip tone="good" label="battery" value="good (100%)" />
      </div>
    </Drawer>

    <!-- Drill panel -->
    <DrillPanel title="Signal drill-down" @close="() => {}">
      <p class="section-caption">Off-white drill section — no colored stripe, hairline border, standard close.</p>
    </DrillPanel>

    <Modal v-if="modalOpen" title="Confirm action" :width="480" @close="modalOpen = false">
      <p>Modals teleport to the body, dim with the Fleet overlay, and close on Escape or backdrop click.</p>
      <template #footer>
        <BaseButton variant="primary" @click="modalOpen = false">Confirm</BaseButton>
        <BaseButton variant="secondary" @click="modalOpen = false">Cancel</BaseButton>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import ChartCard from '../components/base/ChartCard.vue'
import BaseButton from '../components/base/BaseButton.vue'
import IconButton from '../components/base/IconButton.vue'
import BaseInput from '../components/base/BaseInput.vue'
import SearchInput from '../components/base/SearchInput.vue'
import BaseSelect from '../components/base/BaseSelect.vue'
import SegmentedControl from '../components/base/SegmentedControl.vue'
import Tabs from '../components/base/Tabs.vue'
import Chip from '../components/base/Chip.vue'
import Badge from '../components/base/Badge.vue'
import ScoreBar from '../components/base/ScoreBar.vue'
import GaugeBar from '../components/base/GaugeBar.vue'
import EmptyState from '../components/base/EmptyState.vue'
import Drawer from '../components/base/Drawer.vue'
import DrillPanel from '../components/base/DrillPanel.vue'
import Modal from '../components/base/Modal.vue'
import GradeBadge from '../components/GradeBadge.vue'
import MetricCard from '../components/MetricCard.vue'
import DataTable from '../components/DataTable.vue'

const inputVal = ref('')
const searchVal = ref('')
const selectVal = ref('All fleets')
const segVal = ref('CPU')
const tabVal = ref('hosts')
const tableFilter = ref('')
const modalOpen = ref(false)

// Sample rows mirroring the score-breakdown mockup
const scoreRows = [
  { name: 'Apple M4', score: 80, grade: 'B' },
  { name: 'Apple M5', score: 77, grade: 'B' },
  { name: 'Apple M2', score: 72, grade: 'C' },
  { name: 'Apple M1', score: 71, grade: 'C' },
]

const tableCols = [
  { key: 'name', label: 'Name' },
  { key: 'score', label: 'Score', type: 'number', tone: (v) => v == null ? null : (v >= 80 ? 'good' : v >= 70 ? 'fair' : v >= 50 ? 'elevated' : 'critical') },
  { key: 'health', label: 'Health', type: 'number', tone: (v) => v == null ? null : (v >= 80 ? null : v >= 70 ? 'fair' : 'critical') },
  { key: 'status', label: 'Status', type: 'status' },
]
const tableRows = [
  { name: 'allens-mac-mini', score: 66, health: 74, status: 'healthy' },
  { name: 'mac.localdomain', score: 66, health: 83, status: 'healthy' },
  { name: 'marcus-work-macbook-pro', score: 68, health: 66, status: 'warning' },
  { name: 'nicolas-macbook-pro', score: 88, health: 86, status: 'healthy' },
  { name: 'dales-macbook-pro', score: 45, health: 40, status: 'unhealthy' },
]
</script>

<style scoped>
.styleguide { max-width: 1100px; }
.demo-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.demo-col { display: flex; flex-direction: column; gap: 16px; align-items: flex-start; }
.bar-demo { display: flex; align-items: center; gap: 14px; padding: 8px 0; }
.bar-demo__label { min-width: 110px; font-size: var(--font-size-md); color: var(--fleet-black); }
.bar-demo__score { min-width: 28px; font-size: var(--font-size-md); color: var(--fleet-black-75); font-variant-numeric: tabular-nums; }
.gauge-caption { display: flex; justify-content: space-between; font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black); margin-bottom: 8px; }
.gauge-caption__val { color: var(--status-good); }
</style>
