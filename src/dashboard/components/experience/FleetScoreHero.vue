<template>
  <!-- ─── Fleet Composite Grade Hero ─────────────────────── -->
  <section class="hero-section">
    <GradeCard
      label="Fleet experience score"
      :grade="fleet.grade"
      :score="fleet.score"
      :delta="delta"
      :sparklineData="fleet.sparkline"
      :loading="loading"
      :subtitle="fleet.deviceCount ? `${fleet.deviceCount} hosts` : ''"
    />
  </section>
</template>

<script setup>
import GradeCard from '../GradeCard.vue'

defineProps({
  fleet: { type: Object, required: true },
  delta: { type: Number, default: null },
  loading: { type: Boolean, default: false },
})
</script>

<style scoped>
/* ─── Hero: fleet-wide composite ──────────────── */
.hero-section {
  max-width: 400px;
}
</style>
