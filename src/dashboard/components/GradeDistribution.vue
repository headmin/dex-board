<template>
  <div class="chart-container">
    <h3>{{ title }}</h3>
    <SkeletonLoader v-if="loading" variant="chart" height="200px" />
    <div v-else class="distribution">
      <div v-for="item in grades" :key="item.grade" class="dist-row">
        <div class="grade-cell">
          <GradeBadge :grade="item.grade" />
          <span class="grade-threshold">{{ thresholdLabel(item.grade) }}</span>
        </div>
        <div class="dist-track">
          <div
            class="dist-fill"
            :style="{ width: item.percent + '%', backgroundColor: gradeColor(item.grade) }"
          ></div>
        </div>
        <div class="dist-stats">
          <span class="dist-count">{{ item.count }}</span>
          <span class="dist-pct">{{ item.percent.toFixed(0) }}%</span>
        </div>
      </div>

      <!-- Inline footnote: what makes up the score -->
      <div class="dist-footnote">
        <button class="dist-info-btn" @click="showInfo = !showInfo">
          {{ showInfo ? 'Hide scoring details' : 'How is this scored?' }}
        </button>
        <div v-if="showInfo" class="dist-info">
          <p>The composite score (0–100) is a weighted average of four categories computed hourly from device telemetry:</p>
          <div class="category-row">
            <span class="cat-pill" style="background:#4a90d9">Performance 35%</span>
            <span class="cat-pill" style="background:#3db67b">Device Health 25%</span>
            <span class="cat-pill" style="background:#8b5cf6">Security 20%</span>
            <span class="cat-pill" style="background:#ec4899">Software 20%</span>
          </div>
          <div class="cat-details">
            <div><strong>Performance</strong> — memory pressure, disk usage, top-5 process load, days since reboot</div>
            <div><strong>Device Health</strong> — disk capacity headroom, hardware generation</div>
            <div><strong>Security</strong> — FileVault, firewall, SIP, Gatekeeper status</div>
            <div><strong>Software</strong> — installed app count, browser extension count</div>
          </div>
          <p class="fdrag-note">Network (WiFi) is tracked separately but excluded from the composite — it's environmental, not something IT controls. F-drag rule: if any scored category falls below 40, the composite grade drops one letter.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import SkeletonLoader from './SkeletonLoader.vue'
import GradeBadge from './GradeBadge.vue'

const showInfo = ref(false)

const props = defineProps({
  title: { type: String, default: 'Grade Distribution' },
  data: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false }
})

const grades = computed(() => {
  const total = Object.values(props.data).reduce((s, v) => s + v, 0) || 1
  return ['A', 'B', 'C', 'D', 'F'].map(g => ({
    grade: g,
    count: props.data[g] || 0,
    percent: ((props.data[g] || 0) / total) * 100
  }))
})

function gradeColor(grade) {
  const colors = { A: '#3db67b', B: '#4a90d9', C: '#ebbc43', D: '#e07b3a', F: '#d66c7b' }
  return colors[grade] || '#8b8fa2'
}

function thresholdLabel(grade) {
  const labels = { A: '90–100', B: '75–89', C: '60–74', D: '40–59', F: '0–39' }
  return labels[grade] || ''
}

</script>

<style scoped>
.chart-container {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: var(--pad-large);
  box-shadow: var(--box-shadow);
}

h3 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  margin-bottom: var(--pad-medium);
}

.distribution {
  display: flex;
  flex-direction: column;
  gap: 8px;
}



.dist-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.grade-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 80px;
  flex-shrink: 0;
}

.grade-threshold {
  font-size: 11px;
  color: var(--fleet-black-50);
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.dist-track {
  flex: 1;
  height: 20px;
  background: var(--fleet-black-5);
  border-radius: var(--radius);
  overflow: hidden;
}

.dist-fill {
  height: 100%;
  border-radius: var(--radius);
  transition: width 400ms ease-out;
  min-width: 0;
}

.dist-stats {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 70px;
  justify-content: flex-end;
}

.dist-count {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
}

.dist-pct {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}

/* ─── Footnote / info toggle ───────────────── */

.dist-footnote {
  margin-top: 4px;
  border-top: 1px solid var(--fleet-black-10);
  padding-top: var(--pad-small);
}

.dist-info-btn {
  border: none;
  background: none;
  font-size: 12px;
  color: #6a67fe;
  cursor: pointer;
  font-family: var(--font-body);
  font-weight: 500;
  padding: 0;
}

.dist-info-btn:hover { text-decoration: underline; }

.dist-info {
  margin-top: var(--pad-small);
  font-size: 12px;
  line-height: 1.6;
  color: var(--fleet-black);
}

.dist-info p { margin: 0 0 8px; }

.category-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}

.cat-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  color: white;
  font-weight: 500;
}

.cat-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--fleet-black-50);
  margin-bottom: 8px;
}

.cat-details strong {
  color: var(--fleet-black);
}

.fdrag-note {
  font-size: 11px;
  color: var(--fleet-black-50);
  font-style: italic;
  margin-bottom: 0;
}
</style>
