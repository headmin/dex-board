import { ref, computed } from 'vue'
import { query } from '../services/api'

// ─── Module-level singleton state (shared across all components) ──
const searchText = ref('')
const selectedOS = ref('')
const selectedModel = ref('')
const selectedRAMTier = ref('')
const selectedTeam = ref('')
const heatmapMode = ref('unhealthiest')

// Dropdown options
const osOptions = ref([])
const modelOptions = ref([])
const teamOptions = ref([])
const ramTierOptions = ['8GB', '16GB', '18GB', '24GB', '32GB', '36GB', '48GB', '64GB', '128GB+']
const deviceCount = ref(0)
const optionsLoaded = ref(false)

export function useFleetFilter() {

  const isFleetFiltered = computed(() => {
    return !!(searchText.value.trim() || selectedOS.value || selectedModel.value || selectedRAMTier.value || selectedTeam.value)
  })

  // Param object for API calls — replaces all SQL fragment computeds
  const filterParams = computed(() => {
    const params = {}
    if (searchText.value.trim()) params.search = searchText.value.trim()
    if (selectedOS.value) params.os = selectedOS.value
    if (selectedModel.value) params.model = selectedModel.value
    if (selectedRAMTier.value) params.ramTier = selectedRAMTier.value
    if (selectedTeam.value) params.team = selectedTeam.value
    return params
  })

  const fleetFilterLabel = computed(() => {
    const parts = []
    if (searchText.value.trim()) parts.push(`"${searchText.value.trim()}"`)
    if (selectedOS.value) parts.push(selectedOS.value)
    if (selectedModel.value) parts.push(selectedModel.value)
    if (selectedRAMTier.value) parts.push(selectedRAMTier.value)
    if (selectedTeam.value) parts.push(selectedTeam.value)
    return parts.join(' + ')
  })

  // ─── Load dropdown options ────────────────────────────
  async function loadFilterOptions() {
    if (optionsLoaded.value) return
    try {
      const rows = await query('firehose.devices.filter_options')
      modelOptions.value = rows.filter(r => r.type === 'model').map(r => r.value)
      osOptions.value = rows.filter(r => r.type === 'platform').map(r => r.value)
      teamOptions.value = rows.filter(r => r.type === 'team').map(r => r.value)
      optionsLoaded.value = true
    } catch (e) {
      console.error('Failed to load fleet filter options:', e)
    }
  }

  // ─── Fetch filtered host count ────────────────────────
  async function fetchDeviceCount() {
    try {
      const rows = await query('firehose.devices.filtered_count', filterParams.value)
      deviceCount.value = rows[0]?.cnt || 0
    } catch (e) {
      console.error('Failed to fetch host count:', e)
    }
  }

  // ─── Clear all fleet filters ──────────────────────────
  function clearFleetFilter() {
    searchText.value = ''
    selectedOS.value = ''
    selectedModel.value = ''
    selectedRAMTier.value = ''
    selectedTeam.value = ''
  }

  function setOSFilter(os) { selectedOS.value = os }
  function setModelFilter(model) { selectedModel.value = model }
  function setRAMFilter(ram) { selectedRAMTier.value = ram }
  function setTeamFilter(team) { selectedTeam.value = team }

  return {
    // State
    searchText,
    selectedOS,
    selectedModel,
    selectedRAMTier,
    selectedTeam,
    heatmapMode,

    // Dropdown data
    osOptions,
    modelOptions,
    teamOptions,
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
    setRAMFilter,
    setTeamFilter
  }
}
