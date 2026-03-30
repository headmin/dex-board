<template>
  <div class="chart-container">
    <h3>{{ title }}</h3>
    <SkeletonLoader v-if="loading" variant="table" :rows="4" :columns="4" />
    <div v-else-if="!data.length" class="empty-state">No week-over-week data yet</div>
    <div v-else class="movers-list">
      <div v-for="mover in data" :key="mover.host_identifier">
        <div class="mover-row" :class="{ clickable: true, expanded: expandedId === mover.host_identifier }" @click="toggle(mover)">
          <div class="mover-info">
            <span class="mover-name">{{ mover.hostname }}</span>
            <span class="mover-model">{{ mover.hardware_model }}</span>
          </div>
          <div class="mover-change">
            <div class="grade-transition">
              <GradeBadge :grade="mover.prev_grade" />
              <span class="arrow">→</span>
              <GradeBadge :grade="mover.curr_grade" />
            </div>
            <span class="delta" :class="mover.delta > 0 ? 'delta-up' : 'delta-down'">
              {{ mover.delta > 0 ? '+' : '' }}{{ mover.delta.toFixed(0) }}pt
            </span>
            <span class="expand-arrow">{{ expandedId === mover.host_identifier ? '▾' : '▸' }}</span>
          </div>
        </div>

        <!-- Category breakdown drill-down -->
        <div v-if="expandedId === mover.host_identifier" class="mover-detail">
          <div v-if="detailLoading" class="detail-loading">Analyzing score changes...</div>
          <template v-else>
            <div class="detail-header">
              <span class="detail-label">Category</span>
              <span class="detail-label right">Before</span>
              <span class="detail-label right">Now</span>
              <span class="detail-label right">Change</span>
            </div>
            <div v-for="cat in detailCategories" :key="cat.key" class="detail-row" :class="{ 'is-driver': cat.isDriver }">
              <span class="cat-name">
                {{ cat.label }}
                <span v-if="cat.isDriver" class="driver-tag">primary driver</span>
              </span>
              <span class="cat-score right">{{ cat.prev !== null ? cat.prev.toFixed(0) : '—' }}</span>
              <span class="cat-score right">{{ cat.curr !== null ? cat.curr.toFixed(0) : '—' }}</span>
              <span class="cat-delta right" :class="cat.delta > 0 ? 'delta-up' : cat.delta < 0 ? 'delta-down' : ''">
                {{ cat.delta !== null ? (cat.delta > 0 ? '+' : '') + cat.delta.toFixed(1) : '—' }}
              </span>
            </div>
            <div v-if="detailInsight" class="detail-insight">{{ detailInsight }}</div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import SkeletonLoader from './SkeletonLoader.vue'
import GradeBadge from './GradeBadge.vue'

const props = defineProps({
  title: { type: String, default: 'Biggest Movers (WoW)' },
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  fetchDetail: { type: Function, default: null }
})

const expandedId = ref(null)
const detailLoading = ref(false)
const detailCategories = ref([])
const detailInsight = ref('')

async function toggle(mover) {
  if (expandedId.value === mover.host_identifier) {
    expandedId.value = null
    return
  }
  expandedId.value = mover.host_identifier
  detailLoading.value = true
  detailCategories.value = []
  detailInsight.value = ''

  if (props.fetchDetail) {
    try {
      const result = await props.fetchDetail(mover.host_identifier)
      detailCategories.value = result.categories
      detailInsight.value = result.insight
    } catch (e) {
      console.error('Mover detail fetch failed:', e)
      detailInsight.value = 'Failed to load detail'
    }
  }
  detailLoading.value = false
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

.movers-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.mover-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 4px;
  border-bottom: 1px solid var(--fleet-black-5);
  margin: 0 -4px;
  border-radius: var(--radius);
  transition: background 150ms ease-in-out;
}

.mover-row.clickable {
  cursor: pointer;
}

.mover-row.clickable:hover {
  background: var(--fleet-black-5);
}

.mover-row.expanded {
  background: var(--fleet-black-5);
  border-bottom-color: transparent;
}

.mover-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mover-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
}

.mover-model {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}

.mover-change {
  display: flex;
  align-items: center;
  gap: 12px;
}

.grade-transition {
  display: flex;
  align-items: center;
  gap: 6px;
}

.arrow {
  color: var(--fleet-black-33);
  font-size: var(--font-size-xs);
}

.delta {
  font-size: var(--font-size-xs);
  font-weight: 700;
  min-width: 48px;
  text-align: right;
}

.delta-up {
  color: #1a7a4c;
}

.delta-down {
  color: #b01a3a;
}

.expand-arrow {
  font-size: 11px;
  color: var(--fleet-black-33);
  min-width: 16px;
  text-align: center;
}

/* ─── Detail drill-down ───────────────────────── */
.mover-detail {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  margin: 0 -4px 8px -4px;
  padding: var(--pad-medium);
}

.detail-loading {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  padding: var(--pad-small) 0;
}

.detail-header {
  display: grid;
  grid-template-columns: 1fr 60px 60px 70px;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--fleet-black-10);
  margin-bottom: 4px;
}

.detail-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--fleet-black-50);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.detail-label.right {
  text-align: right;
}

.detail-row {
  display: grid;
  grid-template-columns: 1fr 60px 60px 70px;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--fleet-black-5);
}

.detail-row:last-of-type {
  border-bottom: none;
}

.detail-row.is-driver {
  background: rgba(106, 103, 254, 0.05);
  margin: 0 -8px;
  padding: 6px 8px;
  border-radius: var(--radius);
}

.cat-name {
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
  display: flex;
  align-items: center;
  gap: 8px;
}

.driver-tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--fleet-vibrant-blue);
  background: rgba(106, 103, 254, 0.1);
  padding: 1px 6px;
  border-radius: var(--radius);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.cat-score {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
}

.cat-score.right, .cat-delta.right {
  text-align: right;
}

.cat-delta {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.detail-insight {
  margin-top: var(--pad-small);
  padding-top: var(--pad-small);
  border-top: 1px solid var(--fleet-black-10);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-75);
  line-height: 1.5;
}

.empty-state {
  text-align: center;
  padding: var(--pad-xlarge);
  color: var(--fleet-black-50);
  font-size: var(--font-size-sm);
}
</style>
