<template>
  <div class="fleet-filter-bar">
    <div class="filter-content">
      <div class="search-group">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M7.333 12.667A5.333 5.333 0 107.333 2a5.333 5.333 0 000 10.667zM14 14l-2.9-2.9" stroke="#8b8fa2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <input
          type="text"
          class="search-input"
          placeholder="Search hostname, serial, model..."
          v-model="localSearch"
        />
      </div>

      <div class="filter-divider"></div>

      <div class="filter-group">
        <span class="filter-label">OS</span>
        <div class="select-wrapper">
          <select v-model="selectedOS" class="filter-select">
            <option value="">All</option>
            <option v-for="os in osOptions" :key="os" :value="os">{{ os }}</option>
          </select>
          <svg class="select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="#515774" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <div class="filter-group">
        <span class="filter-label">Model</span>
        <div class="select-wrapper">
          <select v-model="selectedModel" class="filter-select">
            <option value="">All</option>
            <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
          </select>
          <svg class="select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="#515774" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <div class="filter-group">
        <span class="filter-label">RAM</span>
        <div class="select-wrapper">
          <select v-model="selectedRAMTier" class="filter-select">
            <option value="">All</option>
            <option v-for="r in ramTierOptions" :key="r" :value="r">{{ r }}</option>
          </select>
          <svg class="select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="#515774" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <div class="filter-group">
        <span class="filter-label">Encryption</span>
        <div class="select-wrapper">
          <select v-model="selectedEncryption" class="filter-select">
            <option value="">All</option>
            <option value="encrypted">Encrypted</option>
            <option value="not-encrypted">Not Encrypted</option>
          </select>
          <svg class="select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="#515774" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <button v-if="isFleetFiltered" class="clear-btn" @click="clearFleetFilter">
        Clear filters
      </button>

      <button class="wc-toggle" :class="{ active: wcMode }" @click="toggleWcMode" title="Workers Council Mode — hide individual app usage">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        WC Mode
      </button>

      <div class="device-count">
        <span class="count-value">{{ deviceCount.toLocaleString() }}</span>
        <span class="count-label">devices</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useFleetFilter } from '../composables/useFleetFilter'
import { useWorkersCouncil } from '../composables/useWorkersCouncil'

const {
  searchText, selectedOS, selectedModel, selectedEncryption, selectedRAMTier,
  osOptions, modelOptions, ramTierOptions, deviceCount,
  isFleetFiltered, clearFleetFilter,
  loadFilterOptions, fetchDeviceCount
} = useFleetFilter()

const { wcMode, toggleWcMode } = useWorkersCouncil()

const localSearch = ref(searchText.value)
let debounceTimer = null

watch(localSearch, (val) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    searchText.value = val
  }, 300)
})

watch(searchText, (val) => {
  if (val !== localSearch.value) {
    localSearch.value = val
  }
})

watch([searchText, selectedOS, selectedModel, selectedEncryption, selectedRAMTier], () => {
  fetchDeviceCount()
}, { immediate: true })

onMounted(() => {
  loadFilterOptions()
})
</script>

<style scoped>
.fleet-filter-bar {
  background: #fff;
  border-bottom: 1px solid #e2e4ea;
  padding: 8px 24px;
}

.filter-content {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 1280px;
  margin: 0 auto;
  flex-wrap: wrap;
}

.search-group {
  display: flex;
  align-items: center;
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 320px;
}

.search-icon {
  position: absolute;
  left: 12px;
  pointer-events: none;
}

.search-input {
  width: 100%;
  border: 1px solid #e2e4ea;
  border-radius: 4px;
  padding: 8px 16px 8px 32px;
  height: 36px;
  font-family: "Inter", sans-serif;
  font-size: 14px;
  color: #192147;
  background: #fff;
  outline: none;
  transition: border-color 150ms ease-in-out;
}

.search-input::placeholder {
  color: #8b8fa2;
}

.search-input:focus {
  border-color: #192147;
}

.filter-divider {
  width: 1px;
  height: 24px;
  background: #e2e4ea;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-label {
  font-family: "Inter", sans-serif;
  font-size: 12px;
  color: #8b8fa2;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.select-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.filter-select {
  border: 1px solid #e2e4ea;
  border-radius: 4px;
  padding: 6px 28px 6px 10px;
  font-family: "Inter", sans-serif;
  font-size: 14px;
  color: #515774;
  background: #fff;
  cursor: pointer;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  min-width: 90px;
  transition: border-color 150ms ease-in-out;
}

.filter-select:focus {
  border-color: #192147;
}

.filter-select:hover {
  border-color: #c5c7d1;
}

.select-arrow {
  position: absolute;
  right: 10px;
  pointer-events: none;
}

.clear-btn {
  background: #fff;
  border: 1px solid #e2e4ea;
  border-radius: 4px;
  padding: 6px 12px;
  font-family: "Inter", sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #515774;
  cursor: pointer;
  transition: all 150ms ease-in-out;
}

.clear-btn:hover {
  background: #f4f4f6;
  border-color: #c5c7d1;
  color: #192147;
}

.clear-btn:active {
  background: #f0f1f4;
}

.wc-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #fff;
  border: 1px solid #e2e4ea;
  border-radius: 4px;
  padding: 6px 12px;
  font-family: "Inter", sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #515774;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;
}

.wc-toggle:hover {
  background: #f4f4f6;
  border-color: #c5c7d1;
}

.wc-toggle.active {
  background: #065f46;
  border-color: #065f46;
  color: #fff;
}

.wc-toggle.active svg {
  stroke: #fff;
}

.wc-toggle.active:hover {
  background: #064e3b;
}

.device-count {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-left: auto;
  padding: 4px 10px;
  background: #f4f4f6;
  border-radius: 4px;
}

.count-value {
  font-size: 14px;
  font-weight: 600;
  color: #192147;
}

.count-label {
  font-size: 12px;
  color: #8b8fa2;
}

@media (max-width: 768px) {
  .filter-content {
    gap: 8px;
  }
  .search-group {
    min-width: 100%;
  }
  .filter-divider {
    display: none;
  }
}
</style>
