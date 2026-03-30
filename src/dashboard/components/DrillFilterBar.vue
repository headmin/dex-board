<template>
  <transition name="slide">
    <div v-if="isFiltered" class="drill-bar">
      <div class="drill-content">
        <span class="drill-icon">&#x1F50D;</span>
        <span class="drill-label">
          Filtered: <strong>{{ filterLabel }}</strong>
        </span>
        <button class="clear-btn" @click="clearDrill">Clear &times;</button>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { useDrillFilter } from '../composables/useDrillFilter'

const { isFiltered, filterLabel, clearDrill } = useDrillFilter()
</script>

<style scoped>
.drill-bar {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 20px;
}

.drill-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drill-icon {
  font-size: 16px;
}

.drill-label {
  font-size: 14px;
  color: #1e40af;
  flex: 1;
}

.clear-btn {
  background: white;
  border: 1px solid #93c5fd;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 13px;
  color: #1e40af;
  cursor: pointer;
  transition: background 0.15s;
}

.clear-btn:hover {
  background: #dbeafe;
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
