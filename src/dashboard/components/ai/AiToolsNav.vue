<template>
  <!-- Two pages, one subject: the overview answers "what is on the fleet
       today", trends answers "what changed". Pill tabs keep them one click
       apart without a second sidebar entry. -->
  <Tabs :modelValue="current" :options="options" variant="pill" @update:modelValue="go" />
</template>

<script setup>
import { useRouter } from 'vue-router'
import Tabs from '../base/Tabs.vue'

defineProps({ current: { type: String, required: true } })
const router = useRouter()
const options = [
  { value: 'overview', label: 'Overview' },
  { value: 'trends', label: 'Trends' },
]
function go(value) {
  router.push(value === 'trends' ? '/ai-tools/trends' : '/ai-tools')
}
</script>
