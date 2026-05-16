<template>
  <div class="metric-card" :class="{ clickable }">
    <div class="card-header">
      <span class="label">{{ label }}</span>
      <div v-if="trend !== null" class="trend" :class="trendClass">
        <svg v-if="trend > 0" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 9V3M6 3L3 6M6 3L9 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg v-else-if="trend < 0" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 3V9M6 9L9 6M6 9L3 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>{{ Math.abs(trend) }}%</span>
      </div>
    </div>
    <SkeletonLoader v-if="loading" variant="metric" />
    <template v-else>
      <div class="value">{{ formattedValue }}</div>
      <div v-if="subtitle" class="subtitle">{{ subtitle }}</div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SkeletonLoader from './SkeletonLoader.vue'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [Number, String], default: 0 },
  subtitle: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  trend: { type: Number, default: null },
  clickable: { type: Boolean, default: false }
})

const formattedValue = computed(() => {
  if (typeof props.value === 'number') {
    return props.value.toLocaleString()
  }
  return props.value
})

const trendClass = computed(() => {
  if (props.trend > 0) return 'trend-up'
  if (props.trend < 0) return 'trend-down'
  return 'trend-neutral'
})
</script>

<style scoped>
.metric-card {
  background: var(--fleet-white);
  border-radius: var(--radius);
  border: 1px solid var(--fleet-black-10);
  padding: var(--pad-medium);
  transition: border-color var(--transition-base), box-shadow var(--transition-base);
}

.metric-card:hover {
  border-color: var(--fleet-black-25);
}

.metric-card.clickable {
  cursor: pointer;
}

.metric-card.clickable:hover {
  box-shadow: var(--shadow-sm);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pad-xsmall);
}

.label {
  font-size: var(--font-size-xxsmall);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--fleet-black-75);
}

.trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xxsmall);
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-xxlarge);
  line-height: 1;
}

.trend-up {
  color: var(--fleet-success);
  background: rgba(61, 182, 123, 0.12);
}

.trend-down {
  color: var(--fleet-error);
  background: rgba(214, 108, 123, 0.12);
}

.trend-neutral {
  color: var(--fleet-black-50);
  background: var(--fleet-black-5);
}

.value {
  font-size: var(--font-size-xlarge);
  font-weight: 700;
  color: var(--fleet-black);
  line-height: 1.2;
}

.subtitle {
  font-size: var(--font-size-xxsmall);
  color: var(--fleet-black-50);
  margin-top: var(--pad-xxsmall);
}
</style>
