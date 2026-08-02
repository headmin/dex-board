<template>
  <!-- ─── Who — score by cohort (design 1a briefing) ──────────── -->
  <div class="cohort-card">
    <div class="cohort-head">
      <h3 class="cohort-title">Score by cohort</h3>
      <div class="cohort-toggle" role="tablist">
        <button
          v-for="d in DIMENSIONS"
          :key="d.key"
          type="button"
          role="tab"
          class="cohort-toggle-seg"
          :class="{ 'is-active': dim === d.key }"
          :aria-selected="dim === d.key"
          @click="dim = d.key"
        >{{ d.label }}</button>
      </div>
    </div>

    <div v-if="rows.length" class="cohort-rows">
      <div
        v-for="r in rows"
        :key="r.name"
        class="cohort-row"
        :class="{ 'cohort-row--clickable': !!r.onClick }"
        :role="r.onClick ? 'button' : undefined"
        :tabindex="r.onClick ? 0 : undefined"
        :title="r.onClick ? `Filter to ${r.label}` : undefined"
        @click="r.onClick && r.onClick()"
        @keydown.enter="r.onClick && r.onClick()"
      >
        <div class="cohort-row-label">
          <span class="cohort-name">{{ r.label }}</span>
          <span class="cohort-hosts">{{ r.count }} host{{ r.count === 1 ? '' : 's' }}</span>
        </div>
        <div class="cohort-meter">
          <div class="cohort-meter-fill" :style="{ width: (r.score || 0) + '%', background: gradeColor(r.grade) }"></div>
        </div>
        <div class="cohort-score-group">
          <GradeBadge :grade="r.grade" />
          <span class="cohort-score">{{ r.score != null ? Math.round(r.score) : '—' }}</span>
        </div>
      </div>
    </div>
    <EmptyState v-else small title="No cohort data in this window." />

    <div v-if="insight" class="cohort-insight">{{ insight }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import GradeBadge from '../GradeBadge.vue'
import EmptyState from '../base/EmptyState.vue'
import { gradeColor, scoreToGrade } from '../../composables/gradeColors'
import { humanizeToken } from '../../composables/humanize'
import { useFleetFilter } from '../../composables/useFleetFilter'
import { useAppConfig } from '../../composables/useAppConfig'

const props = defineProps({
  /** Scored teams (useExperienceScore.teamRows). */
  teamRows: { type: Array, default: () => [] },
  /** Dimension cuts (useExperienceScore.dimensionData: os=CPU, model, ram). */
  dimensionData: { type: Object, default: () => ({}) },
})

const DIMENSIONS = [
  { key: 'team', label: 'Fleet' },
  { key: 'os', label: 'CPU' },
  { key: 'model', label: 'Model' },
  { key: 'ram', label: 'RAM' },
]

const dim = ref('team')

const { setModelFilter, setRAMFilter, setTeamFilter } = useFleetFilter()
const { config } = useAppConfig()

function teamLabel(id) {
  return config.value.teamNames?.[id] || id
}

const rows = computed(() => {
  if (dim.value === 'team') {
    return props.teamRows
      .filter(t => !t.unscorable)
      .map(t => ({
        name: t.team_id,
        label: teamLabel(t.team_id),
        count: t.hosts,
        score: t.avg_composite,
        grade: scoreToGrade(t.avg_composite),
        onClick: () => setTeamFilter(t.team_id),
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  }
  const list = props.dimensionData?.[dim.value] || []
  return list
    .map(r => ({
      name: r.name,
      label: humanizeToken(String(r.name)),
      count: Number(r.count) || 0,
      score: r.score != null ? Number(r.score) : null,
      grade: r.grade || scoreToGrade(r.score),
      // Only wire clicks where the fleet filter has a matching control.
      onClick: dim.value === 'model' ? () => setModelFilter(r.name)
        : dim.value === 'ram' ? () => setRAMFilter(r.name)
        : null,
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 6)
})

// Honest one-liner: gap between the best and worst cohort in this cut.
const insight = computed(() => {
  const scored = rows.value.filter(r => r.score != null && r.count > 0)
  if (scored.length < 2) return ''
  const best = scored[0]
  const worst = scored[scored.length - 1]
  const gap = Math.round(best.score - worst.score)
  if (gap < 5) return `Cohorts are within ${gap} points of each other — no outlier in this cut.`
  return `${worst.label} averages ${gap} points below ${best.label} (${worst.count} host${worst.count === 1 ? '' : 's'} affected).`
})
</script>

<style scoped>
.cohort-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cohort-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cohort-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 700;
  color: var(--fleet-black);
}

.cohort-toggle {
  display: inline-flex;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-medium);
  overflow: hidden;
  height: 26px;
}

.cohort-toggle-seg {
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  border: 0;
  background: transparent;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  cursor: pointer;
}
.cohort-toggle-seg + .cohort-toggle-seg { border-left: 1px solid var(--fleet-black-10); }
.cohort-toggle-seg.is-active {
  background: var(--fleet-black);
  color: var(--fleet-white);
  font-weight: 600;
}
.cohort-toggle-seg:focus-visible {
  outline: 1px solid var(--fleet-focused-outline);
  outline-offset: -1px;
}

.cohort-rows {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.cohort-row {
  display: grid;
  grid-template-columns: 150px 1fr 76px;
  align-items: center;
  gap: 14px;
  border-radius: var(--radius);
}
.cohort-row--clickable { cursor: pointer; }
.cohort-row--clickable:hover .cohort-name { color: var(--fleet-black); }
.cohort-row--clickable:focus-visible {
  outline: 1px solid var(--fleet-focused-outline);
  outline-offset: 2px;
}

.cohort-row-label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cohort-name {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--fleet-black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cohort-hosts {
  font-size: var(--font-size-xxsmall);
  color: var(--fleet-black-50);
}

.cohort-meter {
  height: 8px;
  background: var(--fleet-black-5);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.cohort-meter-fill { height: 100%; transition: width 400ms ease-out; }

.cohort-score-group {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}

.cohort-score {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--fleet-black);
}

.cohort-insight {
  padding-top: 12px;
  border-top: 1px solid var(--fleet-black-10);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  text-wrap: pretty;
}
</style>
