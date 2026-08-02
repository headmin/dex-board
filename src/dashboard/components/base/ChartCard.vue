<template>
  <section class="chart-card">
    <div class="chart-card-header">
      <h3 class="chart-card-title">{{ title }}</h3>
      <div class="chart-card-actions">
        <slot name="actions"></slot>
      </div>
    </div>
    <div class="chart-card-body">
      <SkeletonLoader v-if="loading" variant="chart" height="240px" />
      <div v-else-if="empty" class="chart-card-empty">{{ emptyText }}</div>
      <slot v-else></slot>
    </div>
  </section>
</template>

<script setup>
import SkeletonLoader from '../SkeletonLoader.vue'

defineProps({
  title: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  empty: { type: Boolean, default: false },
  emptyText: { type: String, default: 'No data' }
})
</script>

<style scoped>
.chart-card {
  background: var(--fleet-white);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-large);
  padding: var(--card-pad);
}

.chart-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pad-medium);
}

.chart-card-title {
  font-size: var(--card-title-size);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0;
}

.chart-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-card-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fleet-black-50);
  font-size: 13px;
  padding: var(--pad-xlarge);
  text-align: center;
}
</style>
