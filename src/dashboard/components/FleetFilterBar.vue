<template>
  <div v-if="!hideBar" class="fleet-filter-bar">
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

      <div class="filters-group">
        <label class="filter-pill" :class="{ 'filter-pill--active': selectedOS }">
          <span class="filter-pill-label">Platform</span>
          <select v-model="selectedOS">
            <option value="">All</option>
            <option v-for="os in osOptions" :key="os" :value="os">{{ os }}</option>
          </select>
        </label>

        <label class="filter-pill" :class="{ 'filter-pill--active': selectedModel }">
          <span class="filter-pill-label">Model</span>
          <select v-model="selectedModel">
            <option value="">All</option>
            <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
          </select>
        </label>

        <label class="filter-pill" :class="{ 'filter-pill--active': selectedRAMTier }" title="Filters hosts with RAM at or below the selected tier">
          <span class="filter-pill-label">RAM</span>
          <select v-model="selectedRAMTier">
            <option value="">All</option>
            <option v-for="r in ramTierOptions" :key="r" :value="r">{{ formatRamOption(r) }}</option>
          </select>
        </label>

        <label v-if="teamOptions.length" class="filter-pill" :class="{ 'filter-pill--active': selectedTeam }" title="Filter to hosts in a specific Fleet (extracted from osquery event name; data layer ships as 'team-XXX')">
          <span class="filter-pill-label">Fleet</span>
          <select v-model="selectedTeam">
            <option value="">All</option>
            <option v-for="t in teamOptions" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
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
          <span class="count-label">{{ Number(deviceCount) === 1 ? 'host' : 'hosts' }}</span>
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
  searchText, selectedOS, selectedModel, selectedRAMTier, selectedTeam,
  osOptions, modelOptions, teamOptions, ramTierOptions, deviceCount,
  isFleetFiltered, clearFleetFilter,
  loadFilterOptions, fetchDeviceCount
} = useFleetFilter()

const { wcMode, toggleWcMode } = useWorkersCouncil()

// Fleet filters only make sense on host-telemetry pages.
const hideBar = computed(() => route.path.startsWith('/audit') || route.path.startsWith('/styleguide'))

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

watch([searchText, selectedOS, selectedModel, selectedRAMTier, selectedTeam], () => {
  fetchDeviceCount()
})

onMounted(() => {
  loadFilterOptions()
  fetchDeviceCount()
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
  flex-wrap: wrap;
  gap: var(--pad-small) var(--pad-smedium);
  max-width: 1440px;
}

.search-group {
  display: flex;
  align-items: center;
  position: relative;
  flex: 0 1 300px;
  min-width: 220px;
}

.search-icon {
  position: absolute;
  left: 12px;
  pointer-events: none;
  color: var(--fleet-black-50);
}

.search-group .field__input {
  width: 100%;
  padding-left: 32px;
  padding-right: 32px;
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

.filters-group {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  flex-wrap: wrap;
}

/* One filter = one pill. The label lives inside the control, so a wrap
   can never orphan a label from its select; pills wrap as whole units. */
.filter-pill {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding-left: 10px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color var(--transition-base), background-color var(--transition-base);
}

.filter-pill:hover {
  border-color: var(--fleet-black-50);
}

.filter-pill:focus-within {
  border-color: var(--fleet-black-75);
}

.filter-pill--active {
  border-color: var(--fleet-green);
  background: var(--status-good-bg);
}

.filter-pill--active .filter-pill-label {
  color: var(--status-good-text);
}

.filter-pill-label {
  font-size: var(--font-size-xxsmall);
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--fleet-black-50);
  white-space: nowrap;
}

.filter-pill select {
  appearance: none;
  -webkit-appearance: none;
  height: 100%;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--font-size-xsmall);
  font-weight: 600;
  color: var(--fleet-black);
  padding: 0 26px 0 7px;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2.5 4.5L6 8l3.5-3.5' stroke='%23515774' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}

.field__input {
  padding: var(--pad-small) var(--pad-smedium);
  font-size: var(--font-size-xsmall);
  font-family: inherit;
  color: var(--fleet-black);
  background-color: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  height: 32px;
  outline: none;
  transition: border-color var(--transition-base);
}

.field__input:hover {
  border-color: var(--fleet-black-50);
}

.field__input:focus {
  outline: none;
  border-color: var(--fleet-black-75-down);
}

.field__input::placeholder {
  color: var(--fleet-black-50);
  font-style: italic;
}

/* Button Styles */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
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
  padding: var(--pad-xsmall) var(--pad-smedium);
  height: 32px; /* one control height across the whole bar */
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
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 var(--pad-smedium);
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
  .search-group {
    flex: 1 1 100%;
    max-width: none;
  }
  .filter-actions {
    margin-left: 0;
    width: 100%;
    justify-content: space-between;
  }
}
</style>
