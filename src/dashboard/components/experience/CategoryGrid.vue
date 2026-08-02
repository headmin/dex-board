<template>
  <!-- ─── Category Grade Cards ───────────────────────────── -->
  <section class="category-cards">
    <GradeCard
      v-for="cat in categories"
      :key="cat.key"
      :label="cat.label"
      :grade="cat.grade"
      :score="cat.score"
      :delta="tileDeltas[cat.key]"
      :sparklineData="cat.sparkline"
      :loading="loading"
      :clickable="true"
      :subtitle="cat.key === 'network' ? 'Informational — not in composite' : ''"
      :title="cat.key === 'network' ? 'Network quality is shown for context but excluded from the composite score: Wi-Fi signal is too volatile for a number that drives quarterly decisions. See SCORE-IDEA.md.' : ''"
      @click="$emit('toggle', cat.key)"
    />
  </section>
</template>

<script setup>
import GradeCard from '../GradeCard.vue'

defineProps({
  categories: { type: Array, default: () => [] },
  tileDeltas: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
})

defineEmits(['toggle'])
</script>

<style scoped>
/* ─── Category cards: 5 across ────────────────── */
.category-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--pad-medium);
}

/* ─── Responsive ──────────────────────────────── */
@media (max-width: 1024px) {
  .category-cards {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .category-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .category-cards {
    grid-template-columns: 1fr;
  }
}
</style>
