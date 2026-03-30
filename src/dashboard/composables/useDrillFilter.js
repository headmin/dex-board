import { ref, computed } from 'vue'

const activeDevice = ref(null)
const activeDeviceId = ref(null)
// Hour is stored for display context only
const activeHour = ref(null)

export function useDrillFilter() {
  const isFiltered = computed(() => !!activeDeviceId.value)

  const filterLabel = computed(() => {
    const parts = []
    if (activeDevice.value) parts.push(activeDevice.value)
    if (activeHour.value) {
      const hourPart = activeHour.value.split(' ')[1] || activeHour.value
      parts.push(hourPart)
    }
    return parts.join(' @ ')
  })

  function setDrill(hostname, hostId, hourStr) {
    activeDevice.value = hostname || null
    activeDeviceId.value = hostId || null
    activeHour.value = hourStr || null
  }

  function clearDrill() {
    activeDevice.value = null
    activeDeviceId.value = null
    activeHour.value = null
  }

  return {
    activeDevice,
    activeDeviceId,
    activeHour,
    isFiltered,
    filterLabel,
    setDrill,
    clearDrill
  }
}
