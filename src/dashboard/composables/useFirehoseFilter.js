/**
 * Firehose filter composable.
 *
 * Simplified filter state for firehose views.
 * Firehose tables use host_id/hostname instead of host_identifier,
 * and have different columns than the main fleet data.
 */
import { ref, computed } from 'vue'

const searchText = ref('')
const selectedModel = ref('')
const selectedRamTier = ref('')
const selectedQuality = ref('')

const modelOptions = ref([])
const qualityOptions = ['excellent', 'good', 'fair', 'weak', 'very_weak']
const ramTierOptions = ['8 GB', '16 GB', '32 GB', '64 GB', '128+ GB']

export function useFirehoseFilter() {
  const isFiltered = computed(() =>
    !!(searchText.value || selectedModel.value || selectedRamTier.value || selectedQuality.value)
  )

  const filterParams = computed(() => {
    const p = {}
    if (searchText.value) p.search = searchText.value.trim()
    if (selectedModel.value) p.model = selectedModel.value
    if (selectedRamTier.value) p.ramTier = selectedRamTier.value
    if (selectedQuality.value) p.quality = selectedQuality.value
    return p
  })

  const filterLabel = computed(() => {
    const parts = []
    if (searchText.value) parts.push(`"${searchText.value}"`)
    if (selectedModel.value) parts.push(selectedModel.value)
    if (selectedRamTier.value) parts.push(selectedRamTier.value)
    if (selectedQuality.value) parts.push(selectedQuality.value)
    return parts.join(' + ') || 'All devices'
  })

  function clearFilter() {
    searchText.value = ''
    selectedModel.value = ''
    selectedRamTier.value = ''
    selectedQuality.value = ''
  }

  return {
    searchText,
    selectedModel,
    selectedRamTier,
    selectedQuality,
    modelOptions,
    qualityOptions,
    ramTierOptions,
    isFiltered,
    filterParams,
    filterLabel,
    clearFilter,
  }
}
