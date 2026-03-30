import { ref, computed } from 'vue'
import { query } from '../services/api'

// ─── Module-level singleton state (shared across all components) ──
const searchText = ref('')
const selectedOS = ref('')
const selectedModel = ref('')
const selectedEncryption = ref('')
const selectedRAMTier = ref('')
const heatmapMode = ref('unhealthiest')

// Dropdown options
const osOptions = ref([])
const modelOptions = ref([])
const ramTierOptions = ['8GB', '16GB', '32GB', '64GB+']
const deviceCount = ref(0)
const optionsLoaded = ref(false)

export function useFleetFilter() {

  const isFleetFiltered = computed(() => {
    return !!(searchText.value.trim() || selectedOS.value || selectedModel.value || selectedEncryption.value || selectedRAMTier.value)
  })

  // Param object for API calls — replaces all SQL fragment computeds
  const filterParams = computed(() => {
    const params = {}
    if (searchText.value.trim()) params.search = searchText.value.trim()
    if (selectedOS.value) params.os = selectedOS.value
    if (selectedModel.value) params.model = selectedModel.value
    if (selectedEncryption.value) params.encryption = selectedEncryption.value
    if (selectedRAMTier.value) params.ramTier = selectedRAMTier.value
    return params
  })

  const fleetFilterLabel = computed(() => {
    const parts = []
    if (searchText.value.trim()) parts.push(`"${searchText.value.trim()}"`)
    if (selectedOS.value) parts.push(selectedOS.value)
    if (selectedModel.value) parts.push(selectedModel.value)
    if (selectedEncryption.value) parts.push(selectedEncryption.value)
    if (selectedRAMTier.value) parts.push(selectedRAMTier.value)
    return parts.join(' + ')
  })

  // ─── Load dropdown options ─────────────────────────────
  async function loadFilterOptions() {
    if (optionsLoaded.value) return
    try {
      const rows = await query('devices.filter_options')
      osOptions.value = rows.filter(r => r.type === 'os').map(r => r.value)
      modelOptions.value = rows.filter(r => r.type === 'model').map(r => r.value)
      optionsLoaded.value = true
    } catch (e) {
      console.error('Failed to load fleet filter options:', e)
    }
  }

  // ─── Fetch filtered device count ───────────────────────
  async function fetchDeviceCount() {
    try {
      const rows = await query('devices.count', filterParams.value)
      deviceCount.value = rows[0]?.cnt || 0
    } catch (e) {
      console.error('Failed to fetch device count:', e)
    }
  }

  // ─── Clear all fleet filters ───────────────────────────
  function clearFleetFilter() {
    searchText.value = ''
    selectedOS.value = ''
    selectedModel.value = ''
    selectedEncryption.value = ''
    selectedRAMTier.value = ''
  }

  function setOSFilter(os) { selectedOS.value = os }
  function setModelFilter(model) { selectedModel.value = model }
  function setRAMFilter(ram) { selectedRAMTier.value = ram }

  return {
    // State
    searchText,
    selectedOS,
    selectedModel,
    selectedEncryption,
    selectedRAMTier,
    heatmapMode,

    // Dropdown data
    osOptions,
    modelOptions,
    ramTierOptions,
    deviceCount,

    // Params (replaces SQL computeds)
    filterParams,
    isFleetFiltered,
    fleetFilterLabel,

    // Actions
    loadFilterOptions,
    fetchDeviceCount,
    clearFleetFilter,
    setOSFilter,
    setModelFilter,
    setRAMFilter
  }
}
