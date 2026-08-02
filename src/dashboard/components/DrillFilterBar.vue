<template>
  <transition name="slide">
    <div v-if="isFiltered" class="drill-bar">
      <div class="drill-content">
        <span class="drill-icon">&#x1F50D;</span>
        <span class="drill-label">
          Filtered: <strong>{{ filterLabel }}</strong>
        </span>
        <BaseButton size="small" variant="subdued" @click="clearDrill">Clear &times;</BaseButton>
      </div>
    </div>
  </transition>
</template>

<script setup>
import BaseButton from './base/BaseButton.vue'
import { useDrillFilter } from '../composables/useDrillFilter'

const { isFiltered, filterLabel, clearDrill } = useDrillFilter()
</script>

<style scoped>
.drill-bar {
  background: var(--info-tint);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-small) var(--pad-medium);
  margin-bottom: var(--pad-large);
}

.drill-content {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
}

.drill-icon {
  font-size: 14px;
}

.drill-label {
  font-size: 13px;
  color: var(--fleet-status-info);
  flex: 1;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
