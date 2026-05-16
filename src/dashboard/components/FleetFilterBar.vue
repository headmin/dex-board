<template>
  <div class="fleet-filter-bar">
    <div class="filter-content">
      <div class="search-group">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M7 12A5 5 0 107 2a5 5 0 000 10zM14 14l-2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <input
          type="text"
          class="field__input"
          placeholder="Search hostname, serial, model..."
          v-model="localSearch"
        />
        <button v-if="localSearch" class="search-clear" @click="localSearch = ''">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="filter-divider"></div>

      <div class="filters-group">
        <div class="field field--inline">
          <label class="field__label field__label--inline">{{ isFirehose ? 'Platform' : 'OS' }}</label>
          <select v-model="selectedOS" class="field__input">
            <option value="">All</option>
            <option v-for="os in osOptions" :key="os" :value="os">{{ os }}</option>
          </select>
        </div>

        <div class="field field--inline">
          <label class="field__label field__label--inline">Model</label>
          <select v-model="selectedModel" class="field__input">
            <option value="">All</option>
            <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>

        <div class="field field--inline">
          <label class="field__label field__label--inline" title="Filters hosts with RAM at or below the selected tier">RAM</label>
          <select v-model="selectedRAMTier" class="field__input">
            <option value="">All</option>
            <option v-for="r in ramTierOptions" :key="r" :value="r">{{ formatRamOption(r) }}</option>
          </select>
        </div>

        <div v-if="!isFirehose" class="field field--inline">
          <label class="field__label field__label--inline">Encryption</label>
          <select v-model="selectedEncryption" class="field__input">
            <option value="">All</option>
            <option value="encrypted">Encrypted</option>
            <option value="not-encrypted">Not Encrypted</option>
          </select>
        </div>
      </div>

      <button v-if="isFleetFiltered" class="button button--inverse button--small" @click="clearFleetFilter">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Clear
      </button>

      <div class="filter-actions">
        <button class="button button--inverse button--small wc-toggle" :class="{ active: wcMode }" @click="toggleWcMode" title="Workers Council Mode">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>WC</span>
        </button>

        <div class="device-count">
          <span class="count-value">{{ deviceCount.toLocaleString() }}</span>
          <span class="count-label">devices</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useFleetFilter } from '../composables/useFleetFilter'
import { useWorkersCouncil } from '../composables/useWorkersCouncil'

const route = useRoute()

const {
  searchText, selectedOS, selectedModel, selectedEncryption, selectedRAMTier,
  osOptions, modelOptions, ramTierOptions, deviceCount, firehoseMode,
  isFleetFiltered, clearFleetFilter,
  loadFilterOptions, fetchDeviceCount, setFirehoseMode
} = useFleetFilter()

const { wcMode, toggleWcMode } = useWorkersCouncil()

const isFirehose = computed(() => !route.path.startsWith('/overview') && !route.path.startsWith('/audit'))

const localSearch = ref(searchText.value)
let debounceTimer = null

function formatRamOption(tier) {
  if (tier === '128GB+') return 'Any (incl. 128 GB+)'
  return tier.replace('GB', ' GB')
}

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

watch(isFirehose, (val) => {
  setFirehoseMode(val)
}, { immediate: true })

onMounted(() => {
  if (isFirehose.value) {
    setFirehoseMode(true)
  } else {
    loadFilterOptions()
  }
})
</script>

<style scoped>
.fleet-filter-bar {
  background: var(--fleet-white);
  border-bottom: 1px solid var(--fleet-black-10);
  padding: var(--pad-smedium) var(--pad-large);
}

.filter-content {
  display: flex;
  align-items: center;
  gap: var(--pad-medium);
  max-width: 1440px;
}

.search-group {
  display: flex;
  align-items: center;
  position: relative;
  flex: 0 1 280px;
  min-width: 180px;
}

.search-icon {
  position: absolute;
  left: 12px;
  pointer-events: none;
  color: var(--fleet-black-50);
}

.search-group .field__input {
  width: 100%;
  padding-left: 36px;
  padding-right: 36px;
}

.search-clear {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--fleet-black-50);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.search-clear:hover {
  background: var(--fleet-black-5);
  color: var(--fleet-black);
}

.filter-divider {
  width: 1px;
  height: 24px;
  background: var(--fleet-black-10);
}

.filters-group {
  display: flex;
  align-items: center;
  gap: var(--pad-medium);
  flex-wrap: wrap;
}

/* Fleet Input Styles */
.field {
  display: flex;
  flex-direction: column;
  gap: var(--pad-xsmall);
}

.field--inline {
  flex-direction: row;
  align-items: center;
  gap: var(--pad-small);
}

.field__label {
  font-size: var(--font-size-xxsmall);
  font-weight: 700;
  color: var(--fleet-black-75);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.field__label--inline {
  text-transform: none;
  font-weight: 400;
  color: var(--fleet-black);
  font-size: var(--font-size-xsmall);
}

.field__input {
  padding: var(--pad-small) var(--pad-smedium);
  font-size: var(--font-size-xsmall);
  font-family: inherit;
  color: var(--fleet-black);
  background-color: var(--fleet-white);
  border: 1px solid var(--fleet-black-25);
  border-radius: var(--radius);
  height: 36px;
  outline: none;
  transition: border-color var(--transition-base);
}

.field__input:hover {
  border-color: var(--fleet-black-50);
}

.field__input:focus {
  border-color: var(--fleet-green);
  box-shadow: 0 0 0 3px rgba(0, 154, 125, 0.15);
}

.field__input::placeholder {
  color: var(--fleet-black-50);
  font-style: italic;
}

select.field__input {
  cursor: pointer;
  padding-right: var(--pad-large);
}

/* Button Styles */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: var(--pad-small) var(--pad-medium);
  height: 36px;
  border: 0;
  border-radius: var(--radius);
  font-size: var(--font-size-xsmall);
  font-weight: 700;
  font-family: inherit;
  color: var(--fleet-white);
  cursor: pointer;
  text-decoration: none;
  transition: background-color var(--transition-base), color var(--transition-base);
}

.button:focus {
  outline: none;
}

.button:focus-visible {
  outline: 2px solid var(--fleet-black);
  outline-offset: 2px;
}

.button--small {
  padding: var(--pad-xsmall) var(--pad-small);
  height: 28px;
  font-size: var(--font-size-xxsmall);
}

.button--primary {
  background-color: var(--fleet-green);
}

.button--primary:hover {
  background-color: var(--fleet-green-over);
}

.button--inverse {
  background-color: var(--fleet-white);
  color: var(--fleet-black);
  border: 1px solid var(--fleet-black-10);
}

.button--inverse:hover {
  background-color: var(--fleet-black-5);
}

/* WC Toggle */
.wc-toggle.active {
  background-color: var(--fleet-green);
  border-color: var(--fleet-green);
  color: var(--fleet-white);
}

.wc-toggle.active:hover {
  background-color: var(--fleet-green-over);
}

.wc-toggle.active svg {
  stroke: var(--fleet-white);
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  margin-left: auto;
}

.device-count {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: var(--pad-small) var(--pad-smedium);
  background: var(--fleet-black-5);
  border-radius: var(--radius);
}

.count-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xsmall);
  font-weight: 700;
  color: var(--fleet-black);
}

.count-label {
  font-size: var(--font-size-xxsmall);
  color: var(--fleet-black-50);
}

@media (max-width: 1024px) {
  .filter-content {
    flex-wrap: wrap;
  }
  .search-group {
    flex: 1 1 100%;
    max-width: none;
  }
  .filter-divider {
    display: none;
  }
  .filter-actions {
    margin-left: 0;
    width: 100%;
    justify-content: space-between;
  }
}
</style>
