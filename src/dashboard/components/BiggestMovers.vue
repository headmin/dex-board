<template>
  <div class="chart-container">
    <h3>{{ title }}</h3>
    <SkeletonLoader v-if="loading" variant="table" :rows="4" :columns="4" />
    <EmptyState v-else-if="!data.length" small title="No week-over-week data yet" />
    <div v-else class="movers-list">
      <div v-for="mover in data" :key="mover.host_identifier">
        <div class="mover-row" :class="{ clickable: true, expanded: expandedId === mover.host_identifier }" @click="toggle(mover)">
          <div class="mover-info">
            <span class="mover-name">{{ displayHost(mover) }}</span>
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
            <router-link
              :to="`/hosts/${mover.host_identifier}`"
              class="mover-inspect-link"
              :title="`Open ${displayHost(mover)} in host details`"
              @click.stop
            >→</router-link>
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
                <Badge v-if="cat.isDriver" tone="info" label="Primary driver" />
              </span>
              <span class="cat-score right">{{ cat.prev !== null ? cat.prev.toFixed(0) : '—' }}</span>
              <span class="cat-score right">{{ cat.curr !== null ? cat.curr.toFixed(0) : '—' }}</span>
              <span class="cat-delta right" :class="cat.delta > 0 ? 'delta-up' : cat.delta < 0 ? 'delta-down' : ''">
                {{ cat.delta !== null ? (cat.delta > 0 ? '+' : '') + cat.delta.toFixed(1) : '—' }}
              </span>
            </div>
            <div v-if="detailInsight" class="detail-insight">{{ detailInsight }}</div>
            <!-- Bottom CTA: after the user reads the breakdown + insight,
                 give them an obvious "now take me to that host" exit. -->
            <div class="mover-detail-footer">
              <router-link
                :to="`/hosts/${expandedId}`"
                custom
                v-slot="{ navigate }"
              >
                <BaseButton variant="primary" size="small" @click.stop="navigate">Inspect host detail →</BaseButton>
              </router-link>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import SkeletonLoader from './base/SkeletonLoader.vue'
import GradeBadge from './GradeBadge.vue'
import Badge from './base/Badge.vue'
import BaseButton from './base/BaseButton.vue'
import EmptyState from './base/EmptyState.vue'
import { displayHost } from '../composables/displayName'

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
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  box-shadow: var(--box-shadow);
}

h3 {
  font-size: var(--font-size-sm);
  font-weight: 700;
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
  padding: var(--pad-small) var(--pad-xsmall);
  border-bottom: 1px solid var(--fleet-black-5);
  margin: 0 calc(-1 * var(--pad-xsmall));
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
  gap: var(--pad-smedium);
}

.grade-transition {
  display: flex;
  align-items: center;
  gap: 5px;
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
  color: var(--fleet-status-success);
}

.delta-down {
  color: var(--fleet-status-error);
}

.expand-arrow {
  font-size: 10px;
  color: var(--fleet-black-33);
  min-width: 16px;
  text-align: center;
}

.mover-inspect-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: var(--fleet-black-50);
  text-decoration: none;
  font-weight: 600;
  font-size: 12px;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
}

.mover-inspect-link:hover {
  background: var(--fleet-black-5);
  border-color: var(--fleet-black-25);
  color: var(--fleet-black);
  transform: translateX(1px);
}

/* ─── Detail drill-down ───────────────────────── */
.mover-detail {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  margin: 0 calc(-1 * var(--pad-xsmall)) var(--pad-small);
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
  gap: 7px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--fleet-black-10);
  margin-bottom: 4px;
}

.detail-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--fleet-black-75);
}

.detail-label.right {
  text-align: right;
}

.detail-row {
  display: grid;
  grid-template-columns: 1fr 60px 60px 70px;
  gap: 7px;
  padding: 5px 0;
  border-bottom: 1px solid var(--fleet-black-5);
}

.detail-row:last-of-type {
  border-bottom: none;
}

.detail-row.is-driver {
  background: var(--info-tint-soft);
  margin: 0 calc(-1 * var(--pad-small));
  padding: var(--pad-xsmall) var(--pad-small);
  border-radius: var(--radius);
}

.cat-name {
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
  display: flex;
  align-items: center;
  gap: 7px;
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

.mover-detail-actions {
  display: flex; justify-content: flex-end;
  margin-bottom: var(--pad-small);
}
.mover-detail-footer {
  display: flex; justify-content: flex-end;
  margin-top: var(--pad-small);
  padding-top: var(--pad-small);
  border-top: 1px solid var(--fleet-black-10);
}
</style>
