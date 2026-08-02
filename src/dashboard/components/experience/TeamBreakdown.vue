<template>
  <!-- ─── Per-Fleet breakdown ────────────────────────────── -->
  <!-- Always rendered (reserved layout) when any team exists, to avoid
       the filter-bar selection causing the rest of the page to jump. -->
  <section v-show="teamRows.length" class="team-breakdown">
    <div class="team-breakdown-header">
      <h3>Per-fleet breakdown</h3>
      <span class="team-breakdown-note">composite score grouped by Fleet (team-XXX) — small cohorts are noisy, watch the host count</span>
    </div>
    <div class="team-breakdown-grid">
      <div v-for="t in teamRows" :key="t.team_id" class="team-card" :class="{ 'team-card--missing': t.unscorable }">
        <div class="team-card-head">
          <span class="team-card-id" :title="t.team_id">{{ teamLabel(t.team_id) }}</span>
          <span class="team-card-hosts">{{ t.unscorable ? 'no scorable hosts' : `${t.hosts} host${t.hosts === 1 ? '' : 's'}` }}</span>
        </div>
        <template v-if="!t.unscorable">
          <div class="team-card-grade-row">
            <span class="team-card-grade" :class="'grade-' + (scoreToGrade(t.avg_composite) || '').toLowerCase()">{{ scoreToGrade(t.avg_composite) }}</span>
            <span class="team-card-score">{{ t.avg_composite != null ? t.avg_composite.toFixed(0) : '—' }}<span class="team-card-score-max">/100</span></span>
          </div>
          <div class="team-card-cats">
            <span class="team-cat" :title="`Device Health: ${t.avg_device_health}`"><span class="team-cat-key">DH</span><span class="team-cat-val">{{ t.avg_device_health != null ? t.avg_device_health.toFixed(0) : '—' }}</span></span>
            <span class="team-cat" :title="`Performance: ${t.avg_performance}`"><span class="team-cat-key">Perf</span><span class="team-cat-val">{{ t.avg_performance != null ? t.avg_performance.toFixed(0) : '—' }}</span></span>
            <span class="team-cat" :title="`Security: ${t.avg_security}`"><span class="team-cat-key">Sec</span><span class="team-cat-val">{{ t.avg_security != null ? t.avg_security.toFixed(0) : '—' }}</span></span>
            <span class="team-cat" :title="`Software: ${t.avg_software}`"><span class="team-cat-key">SW</span><span class="team-cat-val">{{ t.avg_software != null ? t.avg_software.toFixed(0) : '—' }}</span></span>
          </div>
        </template>
        <template v-else>
          <div class="team-card-missing">
            Hosts visible in <code>host_teams</code> but don't currently run the
            Hardware-experience + Device-health schedules required to score.
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useAppConfig } from '../../composables/useAppConfig'
import { scoreToGrade } from '../../composables/useExperienceScore'

defineProps({
  teamRows: { type: Array, default: () => [] },
})

const { config } = useAppConfig()
// Friendly team label from the config map (TEAM_NAMES); falls back to the raw
// numeric id. Telemetry only carries the id, so names are config-driven.
function teamLabel(id) {
  return config.value.teamNames?.[id] || id
}
</script>

<style scoped>
/* ─── Per-fleet (team) breakdown ──────────────── */
.team-breakdown {
  margin-top: var(--pad-medium);
  padding: var(--pad-medium) var(--pad-large);
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}
.team-breakdown-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 11px;
  margin-bottom: 11px;
  flex-wrap: wrap;
}
.team-breakdown-header h3 {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 700;
  color: var(--fleet-black);
}
.team-breakdown-note {
  font-size: 10px;
  color: var(--fleet-black-50);
  font-style: italic;
}
.team-breakdown-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 11px;
}
.team-card {
  padding: 11px 13px;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  background: var(--fleet-off-white);
}
.team-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 7px;
  margin-bottom: 7px;
}
.team-card-id {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
}
.team-card-hosts {
  font-size: 10px;
  color: var(--fleet-black-50);
}
.team-card-grade-row {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin-bottom: 9px;
}
.team-card-grade {
  font-size: 29px;
  font-weight: 700;
  line-height: 1;
}
.team-card-grade.grade-a { color: var(--fleet-success); }
.team-card-grade.grade-b { color: var(--status-good); }
.team-card-grade.grade-c { color: var(--fleet-warning); }
.team-card-grade.grade-d { color: var(--fleet-ui-orange); }
.team-card-grade.grade-f { color: var(--fleet-error); }
.team-card-score {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--fleet-black);
}
.team-card-score-max {
  font-size: 10px;
  color: var(--fleet-black-50);
  margin-left: 2px;
}
.team-card-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.team-cat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 10px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
}
.team-cat-key {
  color: var(--fleet-black-75);
  font-weight: 500;
}
.team-cat-val {
  color: var(--fleet-black);
  font-weight: 600;
}
.team-card--missing {
  background: var(--fleet-black-5);
  border-style: dashed;
}
.team-card-missing {
  font-size: 10px;
  color: var(--fleet-black-50);
  line-height: 1.5;
}
.team-card-missing code {
  font-family: var(--font-mono);
  font-size: 9px;
  background: var(--fleet-black-10);
  padding: 1px 4px;
  border-radius: 3px;
}
</style>
