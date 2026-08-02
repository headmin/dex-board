<template>
  <div class="timeline-page page-stack">
    <PageHeader title="GitOps timeline">
      <template #actions>
        <SegmentedControl v-model="selectedRange" :options="ranges" />
        <BaseButton
          :variant="releasesOnly ? 'primary' : 'secondary'"
          :title="releasesOnly ? 'Showing software releases only' : 'Show software releases only'"
          @click="releasesOnly = !releasesOnly"
        >Releases only</BaseButton>
      </template>
    </PageHeader>

    <!-- GitHub-style score heatmap -->
    <section class="section">
      <SectionHeader
        title="Fleet health heatmap"
        caption="Hourly fleet composite score · darker = healthier · dots mark git deployments"
      />
      <div class="heatmap-scroll">
        <div class="heatmap-grid" :style="{ gridTemplateColumns: `60px repeat(24, 1fr)` }">
          <!-- Hour headers -->
          <div class="heatmap-label corner"></div>
          <div v-for="h in 24" :key="'h'+h" class="heatmap-hour">{{ String(h-1).padStart(2,'0') }}</div>
          <!-- Day rows -->
          <template v-for="day in heatmapDays" :key="day.date">
            <div class="heatmap-label">{{ day.label }}</div>
            <div
              v-for="h in 24"
              :key="day.date+'-'+h"
              class="heatmap-cell"
              :style="{ background: cellColor(day.cells[h-1]) }"
              :title="cellTooltip(day.date, h-1, day.cells[h-1])"
              :class="{ 'has-deploy': cellHasDeploy(day.date, h-1) }"
            >
              <span v-if="cellHasDeploy(day.date, h-1)" class="deploy-dot"></span>
            </div>
          </template>
        </div>
        <div class="heatmap-legend">
          <span class="legend-label">Lower</span>
          <div class="legend-block" style="background:#eb4343"></div>
          <div class="legend-block" style="background:#eb6743"></div>
          <div class="legend-block" style="background:var(--status-fair)"></div>
          <div class="legend-block" style="background:#4bb79b"></div>
          <div class="legend-block" style="background:var(--fleet-green)"></div>
          <span class="legend-label">Higher</span>
          <span class="legend-deploy"><span class="deploy-dot-legend"></span> Deploy</span>
        </div>
      </div>
    </section>

    <!-- Upstream Fleet-maintained app releases (from fmalibrary.com) -->
    <section v-if="fmaReleasesInRange.length" class="section">
      <SectionHeader title="App releases" />
      <p class="section-caption">
        Vendor-published Fleet-maintained app versions in this window · click "Show hosts patched" to
        match each release against <code>dex_patch_events</code> for the {{ fmaWindowDays }} days that follow.
      </p>
      <div class="fma-grid">
        <FmaReleaseCard
          v-for="r in fmaReleasesInRange"
          :key="r.id"
          :release="r"
          :rows="fmaDeviceCounts[r.id] ?? null"
          :loading="!!fmaDeviceLoading[r.id]"
          :windowDays="fmaWindowDays"
          @load-devices="loadFmaReleaseDevices"
        >
          <div v-if="fmaDeviceCounts[r.id] && fmaDeviceCounts[r.id].length" class="fma-rollout edp-table-wrap">
            <table class="edp-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>From → To</th>
                  <th>Hosts</th>
                  <th>First (+lag)</th>
                  <th>Avg / Max</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(w, wi) in fmaDeviceCounts[r.id]" :key="wi">
                  <td>{{ w.software_name }}</td>
                  <td class="edp-mono">{{ w.old_version || '—' }} → {{ w.new_version }}</td>
                  <td><strong>{{ w.device_count }}</strong></td>
                  <td>
                    {{ formatTime(w.first_applied) }}
                    <span class="rollout-rel">(+{{ formatHours(w.hours_to_first_patch) }})</span>
                  </td>
                  <td>
                    <span :class="lagClass(w.avg_lag)">{{ w.avg_lag }}d</span> /
                    <span :class="lagClass(w.max_lag)">{{ w.max_lag }}d</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </FmaReleaseCard>
      </div>
    </section>

    <!-- Timeline -->
    <section class="section">
      <SectionHeader
        title="Deployment timeline"
        caption="Git commits to main with correlated fleet events · click to expand"
      />

      <div v-if="loading" class="timeline-loading">Loading timeline data...</div>

      <div v-else class="timeline">
        <div
          v-for="(commit, idx) in displayedCommits"
          :key="commit.hash"
          class="timeline-entry"
          :class="{ expanded: expandedHash === commit.hash, 'has-impact': commit.hasImpact, 'is-release': isReleaseCommit(commit) }"
        >
          <!-- Timeline connector -->
          <div class="timeline-rail">
            <div class="timeline-dot" :class="commitDotClass(commit)"></div>
            <div v-if="idx < displayedCommits.length - 1" class="timeline-line"></div>
          </div>

          <!-- Commit card -->
          <div class="timeline-card" @click="toggleExpand(commit.hash)">
            <div class="commit-header">
              <code class="commit-hash">{{ commit.hash }}</code>
              <span class="commit-time">{{ formatTime(commit.timestamp) }}</span>
              <!-- What this commit changed (from git diff, not guessed) -->
              <span v-for="ct in (commit.changeTypes || [])" :key="ct" class="change-type-pill" :class="'ct-' + ct">{{ changeTypeLabel(ct) }}</span>
              <Badge v-if="commit.tags.length" tone="info" :label="commit.tags.length + ' pinned'" />
            </div>
            <div class="commit-message">{{ commit.message }}</div>
            <div class="commit-meta">
              <span class="commit-author">{{ commit.author }}</span>
              <span v-if="commit.teamsAffected && commit.teamsAffected.length" class="commit-teams">
                → {{ commit.teamsAffected.join(', ') }}
              </span>
              <span v-if="commit.files && commit.files.length" class="commit-files">
                · {{ commit.files.length }} file{{ commit.files.length > 1 ? 's' : '' }}
              </span>
            </div>

            <!-- Fleet observations (dismissable badges) -->
            <div v-if="visibleEvents(commit).length" class="fleet-events-summary">
              <span
                v-for="(fe, fi) in visibleEvents(commit).slice(0, 4)"
                :key="fe._idx"
                class="fleet-badge"
                :class="[fe.type, 'corr-' + fe.correlation, { 'badge-active': expandedEventKey === commit.hash + '-' + fe._idx }]"
                @click.stop="toggleEventDetail(commit.hash, fe._idx)"
              >
                <span v-if="fe.correlation === 'verified'" class="corr-icon" title="Verified: software name matches commit">&#10003;</span>
                <span v-else-if="fe.correlation === 'likely'" class="corr-icon" title="Likely: commit type matches event">~</span>
                {{ fe.label }}
                <button class="badge-dismiss" @click.stop="dismissEvent(commit.hash, fe._idx)" title="Dismiss">&times;</button>
              </span>
              <span v-if="visibleEvents(commit).length > 4" class="fleet-more">
                +{{ visibleEvents(commit).length - 4 }} more
              </span>
              <BaseButton
                v-if="dismissedEvents[commit.hash] && Object.keys(dismissedEvents[commit.hash]).length"
                variant="link"
                class="badge-restore"
                @click.stop="restoreEvents(commit.hash)"
              >Show {{ Object.keys(dismissedEvents[commit.hash]).length }} dismissed</BaseButton>
            </div>

            <!-- Inline event detail (shown when a badge is clicked, even before full expand) -->
            <div
              v-for="(fe, fi) in commit.fleetEvents"
              :key="'detail-' + fi"
              v-show="expandedEventKey === commit.hash + '-' + fi"
              class="event-detail-panel"
              @click.stop
            >
              <div class="edp-header">
                <span class="fe-icon" :class="fe.type">{{ eventIcon(fe.type) }}</span>
                <span class="edp-title">{{ fe.label }}</span>
                <Badge :tone="severityTones[fe.severity] || 'neutral'" :label="fe.severity" />
                <IconButton label="Close" size="small" @click.stop="expandedEventKey = null">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </IconButton>
              </div>

              <!-- Patch rollout detail (aggregated) -->
              <template v-if="fe.type === 'patch_wave' && fe.data">
                <div class="edp-score-detail">
                  <div class="edp-score-row">
                    <span class="edp-score-label">Software</span>
                    <span class="edp-score-value">{{ fe.data.software }} ({{ fe.data.patchType }})</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Version</span>
                    <span class="edp-score-value edp-mono">{{ fe.data.oldVersion }} → {{ fe.data.newVersion }}</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Devices patched</span>
                    <span class="edp-score-value">{{ fe.data.deviceCount }}</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Avg patch lag</span>
                    <span class="edp-score-value" :class="lagClass(fe.data.avgLag)">{{ fe.data.avgLag }}d</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Slowest device</span>
                    <span class="edp-score-value" :class="lagClass(fe.data.maxLag)">{{ fe.data.maxLag }}d</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Rollout window</span>
                    <span class="edp-score-value">{{ formatTime(fe.data.firstApplied) }} – {{ formatTime(fe.data.lastApplied) }}</span>
                  </div>
                </div>
                <!-- Rollout adoption curve -->
                <BaseButton
                  size="small"
                  class="rollout-btn"
                  @click.stop="loadRollout(fe.data.software, fe.data.newVersion, commit.hash + '-' + fi)"
                >
                  {{ rolloutEventKey === commit.hash + '-' + fi ? 'Hide rollout' : 'Track rollout over time' }}
                </BaseButton>
                <div v-if="rolloutEventKey === commit.hash + '-' + fi" class="rollout-panel">
                  <div v-if="rolloutLoading" class="affected-loading">Loading rollout data...</div>
                  <template v-else-if="rolloutData">
                    <p class="rollout-summary">
                      <strong>{{ fe.data.software }} {{ fe.data.newVersion }}</strong> adopted by
                      <strong>{{ rolloutData.adoptedDevices }}</strong>
                      of {{ rolloutData.totalDevices }} fleet devices
                      over {{ rolloutDuration }}.
                      Each bar shows how many devices applied the update per {{ rolloutData.bucketType }}.
                    </p>
                    <div class="rollout-chart">
                      <BarChart
                        :title="fe.data.software + ' ' + fe.data.newVersion + ' — Devices per ' + rolloutData.bucketType"
                        :data="rolloutBarData"
                        :horizontal="false"
                      />
                    </div>
                  </template>
                </div>
              </template>

              <!-- Score change detail -->
              <template v-if="fe.type === 'score_drop' || fe.type === 'score_improvement'">
                <div class="edp-score-detail">
                  <div class="edp-score-row">
                    <span class="edp-score-label">Fleet avg score</span>
                    <span class="edp-score-value">{{ fe.data.score }}</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Change</span>
                    <span class="edp-score-value" :class="deltaClass(fe.data.delta)">
                      {{ fe.data.delta > 0 ? '+' : '' }}{{ fe.data.delta.toFixed(1) }} points
                    </span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Devices reporting</span>
                    <span class="edp-score-value">{{ fe.data.devices }}</span>
                  </div>
                </div>
              </template>

            </div>

            <!-- Expanded detail (full commit drill-down) -->
            <div v-if="expandedHash === commit.hash" class="commit-detail" @click.stop>
              <!-- What changed (files from git) -->
              <div v-if="commit.files && commit.files.length" class="detail-section">
                <h4>Files changed</h4>
                <div class="file-list">
                  <code v-for="f in commit.files" :key="f" class="file-path">{{ f }}</code>
                </div>
              </div>

              <!-- Fleet observations -->
              <div v-if="commit.fleetEvents.length" class="detail-section">
                <h4>Fleet observations</h4>
                <p class="impact-explainer">
                  Events detected on the fleet within ±4 hours of this commit.
                  <template v-if="commit.fleetEvents.some(e => e.type === 'patch_wave')">
                    Patch events are a <strong>direct result</strong> of gitops changes — devices received the deployed software.
                  </template>
                  <template v-if="commit.fleetEvents.some(e => e.type === 'score_drop' || e.type === 'score_improvement')">
                    Score changes are <strong>correlated in time</strong> but may have other causes.
                  </template>
                </p>
                <div v-for="(fe, fi) in commit.fleetEvents" :key="fi"
                  class="fleet-event-row"
                  :class="{ clickable: hasDetail(fe) }"
                  @click.stop="hasDetail(fe) && toggleEventDetail(commit.hash, fi)"
                >
                  <span class="fe-icon" :class="fe.type">{{ eventIcon(fe.type) }}</span>
                  <span class="fe-time">{{ formatTime(fe.time) }}</span>
                  <span class="fe-label">{{ fe.label }}</span>
                  <Badge :tone="corrTones[fe.correlation] || 'neutral'" :label="fe.correlation" />
                  <span v-if="hasDetail(fe)" class="fe-expand-hint">details →</span>
                </div>
              </div>
              <div v-else class="detail-section detail-empty">
                No fleet events detected within ±4 hours of this deploy.
              </div>

              <!-- Fleet impact summary -->
              <div class="detail-section">
                <div class="impact-header-row">
                  <h4>Fleet impact</h4>
                  <BaseButton variant="link" class="score-info-btn" @click.stop="showScoreInfo = !showScoreInfo">
                    {{ showScoreInfo ? 'Hide score info' : 'What is the DEX score?' }}
                  </BaseButton>
                </div>
                <div v-if="showScoreInfo" class="score-info-box">
                  <p>The <strong>DEX composite score</strong> (0–100) measures overall device health. It's a weighted average of four categories, each computed hourly from real device telemetry:</p>
                  <div class="si-categories">
                    <span class="si-cat"><span class="si-dot" :style="{ background: seriesColors.performance }"></span><strong>Performance</strong> 35% — memory %, disk %, top process load, uptime</span>
                    <span class="si-cat"><span class="si-dot" :style="{ background: seriesColors.health }"></span><strong>Host health</strong> 25% — disk capacity, hardware age</span>
                    <span class="si-cat"><span class="si-dot" :style="{ background: seriesColors.security }"></span><strong>Security</strong> 20% — encryption, firewall, SIP, Gatekeeper</span>
                    <span class="si-cat"><span class="si-dot" :style="{ background: seriesColors.software }"></span><strong>Software</strong> 20% — app sprawl, browser extensions</span>
                  </div>
                  <p class="si-grades">Grades: <strong>A</strong> ≥90 · <strong>B</strong> ≥75 · <strong>C</strong> ≥60 · <strong>D</strong> ≥40 · <strong>F</strong> &lt;40. Network (WiFi) is tracked but excluded from scoring — it's environmental. If any scored category is F, the grade drops one letter.</p>
                  <p class="si-context">When this deploy happened, we compare the fleet-wide average composite score from 4h before to 4h after. Devices with a score change &gt;5 points are flagged as improved or degraded.</p>
                </div>
                <p class="impact-explainer">
                  Comparing fleet DEX composite scores from 4h before to 4h after this deploy.
                </p>
                <div v-if="affectedLoading" class="affected-loading">Scanning fleet...</div>
                <template v-else-if="impactSummary">
                  <div class="impact-summary">
                    <div class="impact-stat">
                      <span class="impact-number">{{ impactSummary.total_devices }}</span>
                      <span class="impact-label">devices with scores<br/>in the ±4h window</span>
                    </div>
                    <div class="impact-stat" :class="impactVerdictClass">
                      <span class="impact-number" :class="deltaClass(impactSummary.avg_delta)">
                        {{ parseFloat(impactSummary.avg_delta) > 0 ? '+' : '' }}{{ impactSummary.avg_delta }}
                      </span>
                      <span class="impact-label">avg composite score<br/>change (before → after)</span>
                    </div>
                    <div class="impact-stat">
                      <span class="impact-number delta-good">{{ impactSummary.improved_count }}</span>
                      <span class="impact-label">score improved<br/>(&gt;5 pts up)</span>
                    </div>
                    <div class="impact-stat">
                      <span class="impact-number delta-neutral">{{ impactSummary.stable_count }}</span>
                      <span class="impact-label">no significant<br/>change (±5 pts)</span>
                    </div>
                    <div class="impact-stat">
                      <span class="impact-number delta-bad">{{ impactSummary.degraded_count }}</span>
                      <span class="impact-label">score dropped<br/>(&gt;5 pts down)</span>
                    </div>
                    <div class="impact-stat">
                      <span class="impact-number">{{ impactSummary.fleet_score_before }} → {{ impactSummary.fleet_score_after }}</span>
                      <span class="impact-label">fleet-wide avg<br/>composite score</span>
                    </div>
                  </div>
                  <!-- Verdict sentence -->
                  <p class="impact-verdict" :class="impactVerdictClass">
                    {{ impactVerdict }}
                  </p>
                </template>
                <div v-else class="detail-empty">
                  Not enough DEX score data in the ±4h window to assess impact.
                </div>
              </div>

              <!-- Top movers (outliers only) -->
              <div v-if="topMovers.length" class="detail-section">
                <h4>Hosts with largest score changes</h4>
                <p class="impact-explainer">
                  These devices had the biggest composite score shift in the ±4h window around this deploy.
                  Click a hostname to inspect its health and score breakdown.
                </p>
                <div class="edp-table-wrap">
                  <table class="edp-table">
                    <thead>
                      <tr>
                        <th>Device</th>
                        <th>Platform</th>
                        <th>Before</th>
                        <th>After</th>
                        <th>Delta</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="dev in topMovers" :key="dev.host_identifier"
                        :class="{ 'row-selected': selectedDeviceId === dev.host_identifier }"
                      >
                        <td class="edp-hostname" @click.stop="selectDevice(commit, dev)" style="cursor:pointer">{{ dev.hostname }}</td>
                        <td>{{ dev.os_name }} · {{ dev.hardware_model || '' }}</td>
                        <td>{{ dev.score_before }}</td>
                        <td>{{ dev.score_after }}</td>
                        <td>
                          <span class="ad-delta" :class="deltaClass(dev.score_delta)">
                            {{ parseFloat(dev.score_delta) > 0 ? '+' : '' }}{{ dev.score_delta }}
                          </span>
                        </td>
                        <td>
                          <BaseButton size="small"
                            @click.stop="quickTag(commit.hash, dev)"
                            :disabled="commit.tags.some(t => t.hostId === dev.host_identifier)"
                          >{{ commit.tags.some(t => t.hostId === dev.host_identifier) ? 'Pinned' : 'Pin' }}</BaseButton>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Device inspection panel (inline health view) -->
              <DrillPanel
                v-if="selectedDeviceId && expandedHash === commit.hash"
                class="device-inspect-panel"
                :title="selectedDeviceName + ' — around deploy'"
                @close="clearDeviceSelection()"
              >
                <div v-if="deviceHealthLoading" class="affected-loading">Loading device data...</div>
                <template v-else>
                  <!-- DEX score categories chart (primary view) -->
                  <div v-if="deviceScoreLabels.length" class="inspect-chart">
                    <MultiSeriesChart
                      title="DEX score categories (±12h)"
                      :xLabels="deviceScoreLabels"
                      :series="deviceScoreSeries"
                      :yAxes="[{ name: 'Score', min: 0, max: 100 }]"
                      :events="scoreDeployMarker(commit)"
                      :zoomable="false"
                    />
                  </div>
                  <!-- Memory & Disk chart -->
                  <div v-if="deviceHealthLabels.length" class="inspect-chart">
                    <MultiSeriesChart
                      title="Memory & disk (±12h)"
                      :xLabels="deviceHealthLabels"
                      :series="deviceHealthSeries"
                      :yAxes="[{ name: '%', min: 0, max: 100 }]"
                      :thresholds="memThresholds"
                      :events="deployMarker(commit) ? [deployMarker(commit)] : []"
                      :zoomable="false"
                    />
                  </div>
                  <!-- Patches around this deploy -->
                  <div v-if="devicePatches.length" class="inspect-patches">
                    <h4>Patches applied (±24h)</h4>
                    <div v-for="(p, pi) in devicePatches" :key="pi" class="patch-row">
                      <Badge tone="info" :label="p.patch_type" />
                      <span class="patch-name">{{ p.software_name }}</span>
                      <span class="patch-versions">{{ p.old_version }} → {{ p.new_version }}</span>
                      <Badge v-if="p.days_to_patch" tone="fair" :label="p.days_to_patch + 'd lag'" />
                    </div>
                  </div>
                  <div v-if="!deviceScoreLabels.length && !deviceHealthLabels.length" class="detail-empty">
                    No telemetry data for this device in the ±12h window.
                  </div>
                </template>
              </DrillPanel>

              <!-- Release rollout: what app updates hit hosts in the window after this release commit -->
              <div v-if="isReleaseCommit(commit)" class="detail-section">
                <h4>Release rollout — what hit hosts in the {{ releaseWindowDays }}d after this commit</h4>
                <p class="impact-explainer">
                  This commit changed software config for
                  <strong>{{ (commit.categoriesSoftware || []).join(', ') || 'a Fleet-maintained app' }}</strong>.
                  Below: patches recorded in <code>dex_patch_events</code> for matching software names in the
                  {{ releaseWindowDays }} days after the commit.
                </p>
                <BaseButton
                  size="small"
                  class="rollout-btn"
                  :disabled="releaseRolloutLoading[commit.hash]"
                  @click.stop="loadReleaseRollout(commit)"
                >
                  {{
                    releaseRolloutLoading[commit.hash]
                      ? 'Loading…'
                      : releaseRollouts[commit.hash]
                        ? 'Refresh rollout data'
                        : 'Show what app updates hit hosts'
                  }}
                </BaseButton>
                <div v-if="releaseRollouts[commit.hash]" class="release-rollout-panel">
                  <p v-if="!releaseRollouts[commit.hash].length" class="detail-empty">
                    No matching patches recorded on hosts in the {{ releaseWindowDays }} days after this commit.
                  </p>
                  <div v-else class="edp-table-wrap">
                    <table class="edp-table">
                      <thead>
                        <tr>
                          <th>Software</th>
                          <th>Version</th>
                          <th>Hosts</th>
                          <th>First applied</th>
                          <th>Last applied</th>
                          <th>Lag (avg / max)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(w, wi) in releaseRollouts[commit.hash]" :key="wi">
                          <td>{{ w.software_name }} <Badge tone="info" :label="w.patch_type" /></td>
                          <td class="edp-mono">{{ w.old_version || '—' }} → {{ w.new_version }}</td>
                          <td><strong>{{ w.device_count }}</strong></td>
                          <td>{{ formatTime(w.first_applied) }} <span class="rollout-rel">(+{{ formatHours(w.hours_to_first_patch) }})</span></td>
                          <td>{{ formatTime(w.last_applied) }} <span class="rollout-rel">(+{{ formatHours(w.hours_to_last_patch) }})</span></td>
                          <td>
                            <span :class="lagClass(w.avg_lag)">{{ w.avg_lag }}d</span> /
                            <span :class="lagClass(w.max_lag)">{{ w.max_lag }}d</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- Pinned devices -->
              <div class="detail-section">
                <h4>Pinned hosts</h4>
                <div class="pinned-row">
                  <Chip v-for="tag in commit.tags" :key="tag.hostId" tone="info" class="pinned-chip"
                    :class="{ active: selectedDeviceId === tag.hostId }"
                    @click.stop="selectDeviceById(commit, tag.hostId, tag.hostname)"
                  >
                    <span class="pin-name">{{ tag.hostname }}</span>
                    <span v-if="tag.note" class="pin-note">{{ tag.note }}</span>
                    <button class="pin-remove" @click.stop="handleUntag(commit.hash, tag.hostId)" title="Unpin">×</button>
                  </Chip>
                  <!-- Search to pin any device -->
                  <div class="pin-search-wrap" @click.stop>
                    <SearchInput
                      v-model="deviceSearchText"
                      placeholder="Search host to pin..."
                      :debounce="250"
                      @search="onDeviceSearch"
                    />
                    <div v-if="deviceSearchResults.length" class="pin-search-results">
                      <div
                        v-for="d in deviceSearchResults"
                        :key="d.host_identifier"
                        class="pin-search-result"
                        @click.stop="pinFromSearch(commit.hash, d)"
                      >
                        <span class="psr-name">{{ d.hostname }}</span>
                        <span class="psr-meta">{{ d.os_name }} · {{ d.hardware_model || '' }}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p v-if="!commit.tags.length && !topMovers.length" class="pin-hint">
                  Use "Pin" on top movers above, or search for any device.
                </p>
              </div>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="displayedCommits.length === 0 && !loading"
          small
          :title="releasesOnly ? 'No software releases in the selected time range' : 'No deployments in the selected time range'"
        />
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import dayjs from 'dayjs'
import { useGitopsEvents } from '../composables/useGitopsEvents'
import { useTimelineEvents } from '../composables/useTimelineEvents'
import { useFmaReleases } from '../composables/useFmaReleases'
import { palette, categorical } from '../composables/uiPalette'
import MultiSeriesChart from '../components/MultiSeriesChart.vue'
import BarChart from '../components/BarChart.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import SegmentedControl from '../components/base/SegmentedControl.vue'
import BaseButton from '../components/base/BaseButton.vue'
import IconButton from '../components/base/IconButton.vue'
import SearchInput from '../components/base/SearchInput.vue'
import Badge from '../components/base/Badge.vue'
import Chip from '../components/base/Chip.vue'
import DrillPanel from '../components/base/DrillPanel.vue'
import EmptyState from '../components/base/EmptyState.vue'
import FmaReleaseCard from '../components/base/FmaReleaseCard.vue'

const { gitopsEvents, fetchGitopsEvents } = useGitopsEvents()
const { releases: fmaReleases, fetchFmaReleases, fetchReleaseDevices } = useFmaReleases()
const {
  deviceTags, tagDevice, untagDevice,
  fetchScoreHeatmap, fetchScoreChanges, fetchPatchSummary,
  fetchRolloutProgress, fetchReleaseRollout, fetchImpactSummary, fetchTopMovers, searchDevices,
  fetchDeviceHealthAroundCommit, fetchDeviceScoresAroundCommit, fetchDevicePatchesAroundCommit,
  detectFleetEvents, correlateWithCommits
} = useTimelineEvents()

const ranges = [
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' }
]
const selectedRange = ref('7d')
const loading = ref(false)
const expandedHash = ref(null)
const expandedEventKey = ref(null)
const showScoreInfo = ref(false)
const dismissedEvents = ref({})  // { commitHash: { eventIdx: true } }

// Release rollout (per-commit, lazy-loaded)
const releasesOnly = ref(false)
const releaseWindowDays = 14
const releaseRollouts = ref({})        // { commitHash: Array<patchWaveRow> }
const releaseRolloutLoading = ref({})  // { commitHash: boolean }

// FMA upstream releases (per-release, lazy-loaded)
const fmaWindowDays = 30
const fmaDeviceCounts = ref({})        // { release.id: Array<patchWaveRow> }
const fmaDeviceLoading = ref({})       // { release.id: boolean }

// Data
const scoreHeatmapData = ref([])
const scoreChanges = ref([])
const patchSummary = ref([])
const fleetEvents = ref([])

// Computed date range
const dateRange = computed(() => {
  const now = dayjs()
  const match = selectedRange.value.match(/(\d+)d/)
  const days = match ? parseInt(match[1]) : 7
  return {
    start: now.subtract(days, 'day').format('YYYY-MM-DD HH:mm:ss'),
    end: now.format('YYYY-MM-DD HH:mm:ss')
  }
})

// Git events in range
const commitsInRange = computed(() => {
  const start = dayjs(dateRange.value.start)
  const end = dayjs(dateRange.value.end)
  return gitopsEvents.value.filter(e => {
    const t = dayjs(e.timestamp)
    return t.isAfter(start) && t.isBefore(end)
  })
})

// Enriched commits with fleet event correlation
const enrichedCommits = computed(() =>
  correlateWithCommits(commitsInRange.value, fleetEvents.value, deviceTags.value)
)

// True when a commit is a Fleet-maintained software release (config touched lib/<platform>/software/*)
function isReleaseCommit(commit) {
  const types = commit.changeTypes || []
  const cats = commit.categoriesSoftware || []
  return types.includes('software') || cats.length > 0
}

// What the timeline actually renders (full list, or releases only when toggled)
const displayedCommits = computed(() =>
  releasesOnly.value
    ? enrichedCommits.value.filter(isReleaseCommit)
    : enrichedCommits.value
)

// Derive a substring pattern usable by scores.release_rollout.
// changelog.jsonl uses platform-scoped slugs like "macos/1password"; dex_patch_events
// stores human-readable names like "1Password". We match on the trailing segment.
function releasePattern(commit) {
  const cats = commit.categoriesSoftware || []
  if (cats.length) {
    const last = cats[0].split('/').pop() || cats[0]
    return last.replace(/[-_]/g, ' ')
  }
  // Fallback: try to pull a name out of the file paths
  const file = (commit.files || []).find(f => f.includes('/software/'))
  if (file) {
    const m = file.match(/\/software\/([^/]+?)(?:\.yml|\.yaml)?$/)
    if (m) return m[1].replace(/[-_]/g, ' ')
  }
  return ''
}

async function loadReleaseRollout(commit) {
  if (releaseRolloutLoading.value[commit.hash]) return
  const pattern = releasePattern(commit)
  if (!pattern) {
    releaseRollouts.value = { ...releaseRollouts.value, [commit.hash]: [] }
    return
  }
  releaseRolloutLoading.value = { ...releaseRolloutLoading.value, [commit.hash]: true }
  try {
    const rows = await fetchReleaseRollout(pattern, commit.timestamp, releaseWindowDays)
    releaseRollouts.value = { ...releaseRollouts.value, [commit.hash]: rows || [] }
  } finally {
    releaseRolloutLoading.value = { ...releaseRolloutLoading.value, [commit.hash]: false }
  }
}

function formatHours(h) {
  const n = Number(h)
  if (!isFinite(n)) return '?'
  if (n < 24) return `${Math.round(n)}h`
  return `${Math.round(n / 24)}d`
}

// Upstream FMA releases (vendor-published) in the selected window
const fmaReleasesInRange = computed(() => {
  const start = dayjs(dateRange.value.start)
  const end = dayjs(dateRange.value.end)
  return fmaReleases.value.filter(r => {
    const t = dayjs(r.timestamp)
    return t.isAfter(start) && t.isBefore(end)
  })
})

async function loadFmaReleaseDevices(release) {
  if (fmaDeviceLoading.value[release.id]) return
  fmaDeviceLoading.value = { ...fmaDeviceLoading.value, [release.id]: true }
  try {
    const rows = await fetchReleaseDevices(release, fmaWindowDays)
    fmaDeviceCounts.value = { ...fmaDeviceCounts.value, [release.id]: rows || [] }
  } finally {
    fmaDeviceLoading.value = { ...fmaDeviceLoading.value, [release.id]: false }
  }
}

// ─── Heatmap ────────────────────────────────────────

const heatmapDays = computed(() => {
  const match = selectedRange.value.match(/(\d+)d/)
  const days = match ? parseInt(match[1]) : 7
  const rows = []
  for (let d = days - 1; d >= 0; d--) {
    const date = dayjs().subtract(d, 'day').format('YYYY-MM-DD')
    const label = dayjs().subtract(d, 'day').format('MM/DD ddd')
    const cells = new Array(24).fill(null)
    // Fill from data
    for (const row of scoreHeatmapData.value) {
      if (row.day === date) {
        const hr = parseInt(row.hr)
        cells[hr] = {
          score: parseFloat(row.avg_score),
          devices: parseInt(row.device_count),
          min: parseFloat(row.min_score)
        }
      }
    }
    rows.push({ date, label, cells })
  }
  return rows
})

function cellColor(cell) {
  if (!cell) return '#f4f4f6'
  const s = cell.score
  if (s >= 80) return '#009a7d'
  if (s >= 65) return '#4bb79b'
  if (s >= 50) return '#ecc767'
  if (s >= 35) return '#eb6743'
  return '#eb4343'
}

function cellTooltip(date, hour, cell) {
  const h = String(hour).padStart(2, '0')
  if (!cell) return `${date} ${h}:00 — no data`
  return `${date} ${h}:00\nScore: ${cell.score} (min ${cell.min})\nDevices: ${cell.devices}`
}

function cellHasDeploy(date, hour) {
  return commitsInRange.value.some(c => {
    const t = dayjs(c.timestamp)
    return t.format('YYYY-MM-DD') === date && t.hour() === hour
  })
}

// ─── Timeline helpers ───────────────────────────────

function formatTime(ts) {
  return dayjs(ts).format('MMM DD HH:mm')
}

function commitDotClass(commit) {
  if (commit.fleetEvents.some(e => e.severity === 'high')) return 'dot-red'
  if (commit.fleetEvents.some(e => e.severity === 'medium')) return 'dot-amber'
  if (commit.fleetEvents.length > 0) return 'dot-blue'
  return 'dot-default'
}

function eventIcon(type) {
  switch (type) {
    case 'score_drop': return '↓'
    case 'score_improvement': return '↑'
    case 'patch_wave': return '⟳'
    default: return '•'
  }
}

// Badge tones for event severity and commit correlation
const severityTones = { high: 'critical', medium: 'fair', low: 'good' }
const corrTones = { verified: 'good', likely: 'info', temporal: 'neutral' }

function changeTypeLabel(ct) {
  const labels = {
    software: 'Software',
    profile: 'Profile',
    script: 'Script',
    policy: 'Policy',
    os_update: 'OS update',
    bootstrap: 'Bootstrap',
    config: 'Config'
  }
  return labels[ct] || ct
}

function visibleEvents(commit) {
  const dismissed = dismissedEvents.value[commit.hash] || {}
  return commit.fleetEvents
    .map((fe, i) => ({ ...fe, _idx: i }))
    .filter(fe => !dismissed[fe._idx])
}

function dismissEvent(commitHash, eventIdx) {
  if (!dismissedEvents.value[commitHash]) dismissedEvents.value[commitHash] = {}
  dismissedEvents.value[commitHash][eventIdx] = true
  dismissedEvents.value = { ...dismissedEvents.value }  // trigger reactivity
  if (expandedEventKey.value === commitHash + '-' + eventIdx) expandedEventKey.value = null
}

function restoreEvents(commitHash) {
  delete dismissedEvents.value[commitHash]
  dismissedEvents.value = { ...dismissedEvents.value }
}

function toggleEventDetail(commitHash, eventIndex) {
  const key = commitHash + '-' + eventIndex
  expandedEventKey.value = expandedEventKey.value === key ? null : key
}

function hasDetail(fe) {
  return fe.type === 'patch_wave' || fe.type === 'score_drop' || fe.type === 'score_improvement'
}

const impactVerdict = computed(() => {
  const s = impactSummary.value
  if (!s) return ''
  const total = parseInt(s.total_devices)
  const degraded = parseInt(s.degraded_count)
  const improved = parseInt(s.improved_count)
  const delta = parseFloat(s.avg_delta)

  if (degraded === 0 && improved === 0) return `No significant score movement across ${total} devices. This deploy had no measurable effect on fleet health.`
  if (degraded === 0 && improved > 0) return `${improved} of ${total} devices saw score improvements after this deploy. No devices were negatively affected.`
  if (degraded > 0 && improved === 0) {
    const pct = Math.round(degraded / total * 100)
    return `${degraded} of ${total} devices (${pct}%) saw score drops after this deploy. Average change: ${delta > 0 ? '+' : ''}${delta} points. Investigate the top movers below.`
  }
  return `Mixed results: ${improved} devices improved, ${degraded} degraded out of ${total} total. Net change: ${delta > 0 ? '+' : ''}${delta} points.`
})

const impactVerdictClass = computed(() => {
  const s = impactSummary.value
  if (!s) return ''
  const degraded = parseInt(s.degraded_count)
  const improved = parseInt(s.improved_count)
  if (degraded > 0 && improved === 0) return 'verdict-negative'
  if (improved > 0 && degraded === 0) return 'verdict-positive'
  if (degraded > 0 && improved > 0) return 'verdict-mixed'
  return 'verdict-neutral'
})

function lagClass(days) {
  const d = parseFloat(days)
  if (d <= 1) return 'lag-fast'
  if (d <= 7) return 'lag-ok'
  return 'lag-slow'
}

function toggleExpand(hash) {
  if (expandedHash.value === hash) {
    expandedHash.value = null
    clearDeviceSelection()
  } else {
    expandedHash.value = hash
    clearDeviceSelection()
    const commit = enrichedCommits.value.find(c => c.hash === hash)
    if (commit) loadImpactData(commit)
  }
}

function handleUntag(commitHash, hostId) {
  untagDevice(commitHash, hostId)
}

function quickTag(commitHash, dev) {
  tagDevice(commitHash, dev.host_identifier, dev.hostname, '')
}

// ─── Device search for pinning ─────────────────────
const deviceSearchText = ref('')
const deviceSearchResults = ref([])

// Debounced by SearchInput (:debounce="250")
async function onDeviceSearch() {
  if (deviceSearchText.value.length < 2) {
    deviceSearchResults.value = []
    return
  }
  deviceSearchResults.value = await searchDevices(deviceSearchText.value)
}

function pinFromSearch(commitHash, device) {
  tagDevice(commitHash, device.host_identifier, device.hostname, '')
  deviceSearchText.value = ''
  deviceSearchResults.value = []
}

// ─── Device inspection ─────────────────────────────

const selectedDeviceId = ref(null)
const selectedDeviceName = ref('')
const impactSummary = ref(null)
const topMovers = ref([])
const affectedLoading = ref(false)
const deviceHealthLoading = ref(false)
const deviceHealthLabels = ref([])
const deviceHealthData = ref({ memory: [], disk: [] })
const deviceScoreLabels = ref([])
const deviceScoreData = ref({ composite: [], health: [], performance: [], network: [], security: [], software: [] })
const devicePatches = ref([])

// ─── Rollout tracking ──────────────────────────────
const rolloutData = ref(null)
const rolloutLoading = ref(false)
const rolloutEventKey = ref(null)

const rolloutBarData = computed(() => {
  if (!rolloutData.value?.buckets) return []
  return rolloutData.value.buckets.map(r => ({
    name: r.label,
    value: parseInt(r.devices)
  }))
})

const rolloutDuration = computed(() => {
  if (!rolloutData.value) return ''
  const hours = rolloutData.value.spanHours
  if (hours < 24) return `${hours} hours`
  const days = Math.floor(hours / 24)
  const rem = hours % 24
  return rem > 0 ? `${days}d ${rem}h` : `${days} days`
})

async function loadRollout(softwareName, newVersion, eventKey) {
  if (rolloutEventKey.value === eventKey) {
    // toggle off
    rolloutData.value = null
    rolloutEventKey.value = null
    return
  }
  rolloutLoading.value = true
  rolloutEventKey.value = eventKey
  try {
    rolloutData.value = await fetchRolloutProgress(softwareName, newVersion)
  } catch (e) {
    console.error('Rollout fetch failed:', e)
    rolloutData.value = null
  } finally {
    rolloutLoading.value = false
  }
}

// Series identity colors from the shared JS palette (charts can't resolve var()).
const seriesColors = {
  composite: palette.ink,
  health: palette.good,
  performance: categorical[4],  // blue
  network: categorical[3],      // gold
  security: categorical[2],     // purple
  software: categorical[5],     // pink
}

const memThresholds = [{ value: 85, label: 'Warning', color: palette.critical }]

const deviceHealthSeries = computed(() => [
  { name: 'Memory %', data: deviceHealthData.value.memory, color: seriesColors.performance },
  { name: 'Disk %', data: deviceHealthData.value.disk, color: seriesColors.network }
])

const deviceScoreSeries = computed(() => [
  { name: 'Composite', data: deviceScoreData.value.composite, color: seriesColors.composite },
  { name: 'Health', data: deviceScoreData.value.health, color: seriesColors.health },
  { name: 'Performance', data: deviceScoreData.value.performance, color: seriesColors.performance },
  { name: 'Network', data: deviceScoreData.value.network, color: seriesColors.network },
  { name: 'Security', data: deviceScoreData.value.security, color: seriesColors.security },
  { name: 'Software', data: deviceScoreData.value.software, color: seriesColors.software },
])

function deltaClass(delta) {
  const d = parseFloat(delta)
  if (d < -5) return 'delta-bad'
  if (d < -2) return 'delta-warn'
  if (d > 2) return 'delta-good'
  return 'delta-neutral'
}

function scoreDeployMarker(commit) {
  const commitHour = dayjs(commit.timestamp).format('MM-DD HH:00')
  const idx = deviceScoreLabels.value.indexOf(commitHour)
  if (idx < 0) return []
  return [{ xIndex: idx, label: 'Deploy', hash: commit.hash, message: commit.message, color: palette.info }]
}

function deployMarker(commit) {
  // Place marker at the commit time position on the mini chart
  const commitHour = dayjs(commit.timestamp).format('MM-DD HH:00')
  const idx = deviceHealthLabels.value.indexOf(commitHour)
  if (idx < 0) return null
  return { xIndex: idx, label: 'Deploy', hash: commit.hash, message: commit.message, color: palette.info }
}

async function loadImpactData(commit) {
  affectedLoading.value = true
  try {
    const [summary, movers] = await Promise.all([
      fetchImpactSummary(commit.timestamp),
      fetchTopMovers(commit.timestamp)
    ])
    impactSummary.value = summary
    topMovers.value = movers
  } catch (e) {
    console.error('Failed to load impact data:', e)
    impactSummary.value = null
    topMovers.value = []
  } finally {
    affectedLoading.value = false
  }
}

async function selectDevice(commit, dev) {
  selectedDeviceId.value = dev.host_identifier
  selectedDeviceName.value = dev.hostname
  deviceHealthLoading.value = true
  try {
    const [health, scores, patches] = await Promise.all([
      fetchDeviceHealthAroundCommit(dev.host_identifier, commit.timestamp),
      fetchDeviceScoresAroundCommit(dev.host_identifier, commit.timestamp),
      fetchDevicePatchesAroundCommit(dev.host_identifier, commit.timestamp)
    ])
    deviceHealthLabels.value = health.map(r => r.time)
    deviceHealthData.value = {
      memory: health.map(r => parseFloat(r.memory_percent)),
      disk: health.map(r => parseFloat(r.disk_percent))
    }
    deviceScoreLabels.value = scores.map(r => r.time)
    deviceScoreData.value = {
      composite: scores.map(r => parseFloat(r.composite)),
      health: scores.map(r => parseFloat(r.health)),
      performance: scores.map(r => parseFloat(r.performance)),
      network: scores.map(r => parseFloat(r.network) >= 0 ? parseFloat(r.network) : null),
      security: scores.map(r => parseFloat(r.security) >= 0 ? parseFloat(r.security) : null),
      software: scores.map(r => parseFloat(r.software) >= 0 ? parseFloat(r.software) : null),
    }
    devicePatches.value = patches
  } catch (e) {
    console.error('Failed to load device health:', e)
  } finally {
    deviceHealthLoading.value = false
  }
}

function selectDeviceById(commit, hostId, hostname) {
  selectDevice(commit, { host_identifier: hostId, hostname })
}

function clearDeviceSelection() {
  selectedDeviceId.value = null
  selectedDeviceName.value = ''
  deviceHealthLabels.value = []
  deviceHealthData.value = { memory: [], disk: [] }
  deviceScoreLabels.value = []
  deviceScoreData.value = { composite: [], health: [], performance: [], network: [], security: [], software: [] }
  devicePatches.value = []
  deviceSearchText.value = ''
  deviceSearchResults.value = []
}

// ─── Data loading ───────────────────────────────────

async function loadTimeline() {
  loading.value = true
  try {
    const { start, end } = dateRange.value
    await Promise.all([fetchGitopsEvents(), fetchFmaReleases()])

    const [heatmap, scores, patches] = await Promise.all([
      fetchScoreHeatmap(start, end),
      fetchScoreChanges(start, end),
      fetchPatchSummary(start, end)
    ])

    scoreHeatmapData.value = heatmap
    scoreChanges.value = scores
    patchSummary.value = patches

    fleetEvents.value = detectFleetEvents(scores, patches)
  } catch (e) {
    console.error('Timeline load failed:', e)
  } finally {
    loading.value = false
  }
}

watch(selectedRange, () => loadTimeline())
onMounted(() => loadTimeline())
</script>

<style scoped>
/* ─── Page Layout ─────────────────────────────────────── */
.timeline-page {
  max-width: 1400px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}

.section-caption {
  margin: 0;
  line-height: var(--line-height-relaxed);
}

.section-caption code {
  font-family: var(--font-mono);
  background: var(--fleet-black-5);
  padding: 2px 5px;
  border-radius: var(--radius);
  font-size: var(--font-size-xs);
}

/* ─── Heatmap ─────────────────────────────────────────── */
.heatmap-scroll {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-medium);
  overflow-x: auto;
}

.heatmap-grid {
  display: grid;
  gap: 2px;
  min-width: 600px;
}

.heatmap-label {
  font-family: var(--font-body);
  font-size: 10px;
  color: var(--fleet-black-50);
  display: flex;
  align-items: center;
  padding-right: var(--pad-small);
  white-space: nowrap;
}

.heatmap-hour {
  font-size: 9px;
  color: var(--fleet-black-33);
  text-align: center;
}

.heatmap-cell {
  aspect-ratio: 1;
  border-radius: 3px;
  position: relative;
  min-height: 16px;
  min-width: 16px;
  transition: opacity var(--transition-fast);
}

.heatmap-cell:hover {
  opacity: 0.85;
  outline: 2px solid var(--fleet-black);
  outline-offset: -1px;
}

.heatmap-cell.has-deploy {
  outline: 2px solid var(--fleet-core-vibrant-blue);
  outline-offset: -1px;
}

.deploy-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fleet-core-vibrant-blue);
  border: 1px solid var(--fleet-white);
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: var(--pad-small);
  justify-content: flex-end;
  font-family: var(--font-body);
  font-size: 10px;
  color: var(--fleet-black-50);
}

.legend-block {
  width: 14px;
  height: 14px;
  border-radius: 3px;
}

.legend-deploy {
  margin-left: var(--pad-medium);
  display: flex;
  align-items: center;
  gap: 4px;
}

.deploy-dot-legend {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fleet-core-vibrant-blue);
}

.corner {
  /* empty top-left cell */
}

/* ─── Timeline ────────────────────────────────────────── */
.timeline-loading {
  text-align: center;
  padding: var(--pad-xxl);
  color: var(--fleet-black-50);
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
}

.timeline {
  position: relative;
}

.timeline-entry {
  display: flex;
  gap: var(--pad-medium);
  min-height: 80px;
}

.timeline-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  flex-shrink: 0;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--fleet-black-10);
  background: var(--fleet-white);
  flex-shrink: 0;
  z-index: 1;
}

.dot-default { border-color: var(--fleet-black-25); background: var(--fleet-black-10); }
.dot-blue { border-color: var(--fleet-core-vibrant-blue); background: var(--fleet-core-vibrant-blue); }
.dot-amber { border-color: var(--fleet-status-warning); background: var(--fleet-status-warning); }
.dot-red { border-color: var(--fleet-status-error); background: var(--fleet-status-error); }

.timeline-line {
  width: 2px;
  flex: 1;
  background: var(--fleet-black-10);
  min-height: 20px;
}

.timeline-card {
  flex: 1;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-medium);
  margin-bottom: var(--pad-medium);
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.timeline-card:hover {
  border-color: var(--fleet-black-25);
  box-shadow: var(--shadow-sm);
}

.timeline-entry.expanded .timeline-card {
  border-color: var(--fleet-core-vibrant-blue);
  box-shadow: var(--shadow-md);
}

.commit-header {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  margin-bottom: 5px;
  flex-wrap: wrap;
}

.commit-hash {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--fleet-core-vibrant-blue);
  background: var(--fleet-accent-blue-light);
  padding: 2px 7px;
  border-radius: var(--radius);
  font-weight: 500;
}

.commit-time {
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}

.commit-message {
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
  font-weight: 500;
  margin-bottom: 4px;
  line-height: var(--line-height-normal);
}

.commit-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  flex-wrap: wrap;
}

.commit-author { }
.commit-teams { color: var(--fleet-black-75); font-weight: 600; }
.commit-files { }

/* ─── Change Type Pills ───────────────────────────────── */
.change-type-pill {
  font-family: var(--font-body);
  font-size: 10px;
  padding: 2px 7px;
  border-radius: var(--radius-full);
  font-weight: 600;
}

.ct-software { background: var(--fleet-accent-blue-light); color: var(--fleet-accent-blue); }
.ct-profile { background: var(--fleet-accent-purple-light); color: var(--fleet-accent-purple); }
.ct-script { background: var(--fleet-status-warning-light); color: var(--fleet-status-warning-dark); }
.ct-policy { background: var(--fleet-accent-pink-light); color: var(--fleet-accent-pink); }
.ct-os_update { background: var(--fleet-status-success-light); color: var(--fleet-status-success); }
.ct-bootstrap { background: var(--fleet-accent-indigo-light); color: var(--fleet-accent-indigo); }
.ct-config { background: var(--fleet-black-5); color: var(--fleet-black-75); }

/* ─── File List ───────────────────────────────────────── */
.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-path {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fleet-black-50);
  padding: 4px 7px;
  background: var(--fleet-black-3);
  border-radius: var(--radius);
}

/* ─── Fleet Event Badges ──────────────────────────────── */
.fleet-events-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: var(--pad-small);
}

.fleet-badge {
  font-family: var(--font-body);
  font-size: 10px;
  padding: 3px 9px;
  border-radius: var(--radius-full);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  padding-right: 20px;
}

.fleet-badge:hover {
  filter: brightness(0.95);
  box-shadow: var(--shadow-xs);
}

.fleet-badge.badge-active {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}

.fleet-badge.score_drop { color: var(--fleet-status-error); background: var(--fleet-status-error-light); }
.fleet-badge.score_improvement { color: var(--fleet-status-success); background: var(--fleet-status-success-light); }
.fleet-badge.patch_wave { color: var(--fleet-accent-blue); background: var(--fleet-accent-blue-light); }

.badge-dismiss {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  font-size: 12px;
  color: inherit;
  opacity: 0;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  transition: opacity var(--transition-fast);
}

.fleet-badge:hover .badge-dismiss { opacity: 0.5; }
.badge-dismiss:hover { opacity: 1 !important; }

.badge-restore {
  font-size: 10px;
  padding: 3px 7px;
}

/* ─── Correlation Badges ──────────────────────────────── */
.fleet-badge.corr-verified { border: 1px solid var(--fleet-status-success); }
.fleet-badge.corr-likely { border: 1px solid transparent; }
.fleet-badge.corr-temporal { opacity: 0.7; border: 1px dashed var(--fleet-black-33); }

.corr-icon {
  font-weight: 700;
  margin-right: 2px;
}

.fleet-more {
  font-family: var(--font-body);
  font-size: 10px;
  color: var(--fleet-black-50);
  padding: 3px 9px;
}

/* ─── Event detail panel (inline) ────────────── */

.event-detail-panel {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-small) var(--pad-medium);
  margin-top: var(--pad-small);
}

.edp-header {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  margin-bottom: var(--pad-small);
}

.edp-title {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
}

.edp-table-wrap {
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  overflow: hidden;
  background: var(--fleet-white);
}

.edp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.edp-table th {
  text-align: left;
  background: var(--fleet-off-white);
  font-weight: 700;
  color: var(--fleet-black);
  font-size: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--fleet-black-10);
}

.edp-table td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--fleet-black-10);
  color: var(--fleet-black);
}

.edp-table tr:last-child td { border-bottom: none; }

.edp-hostname {
  font-weight: 600;
  color: var(--fleet-black);
}

.edp-mono {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fleet-black-50);
}

.lag-fast { background: var(--status-good-bg); color: var(--status-good-text); }
.lag-ok { background: var(--status-fair-bg); color: var(--status-fair-text); }
.lag-slow { background: var(--status-critical-bg); color: var(--status-critical); }

.lag-fast, .lag-ok, .lag-slow {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  font-weight: 500;
}

.edp-score-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.edp-score-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: var(--font-size-sm);
}

.edp-score-label { color: var(--fleet-black-50); }
.edp-score-value { font-weight: 600; color: var(--fleet-black); }

.fleet-event-row.clickable { cursor: pointer; }
.fleet-event-row.clickable:hover { background: var(--info-tint-soft); border-radius: var(--radius); }

.fe-expand-hint {
  font-size: 10px;
  font-weight: 600;
  color: var(--fleet-black-75);
  margin-left: auto;
}

/* ─── Expanded detail ────────────────────────── */

.commit-detail {
  margin-top: var(--pad-medium);
  border-top: 1px solid var(--fleet-black-10);
  padding-top: var(--pad-medium);
}

.detail-section {
  margin-bottom: var(--pad-medium);
}

.detail-section h4 {
  font-size: 11px;
  font-weight: 700;
  color: var(--fleet-black);
  margin-bottom: var(--pad-small);
}

.detail-empty {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  font-style: italic;
}

.fleet-event-row {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  padding: 4px 0;
  font-size: var(--font-size-sm);
  border-bottom: 1px solid var(--fleet-black-10);
}

.fleet-event-row:last-child { border-bottom: none; }

.fe-icon {
  width: 20px;
  text-align: center;
  font-size: 13px;
}

.fe-icon.score_drop { color: var(--status-critical); }
.fe-icon.score_improvement { color: var(--fleet-green); }
.fe-icon.patch_wave { color: var(--fleet-accent-blue); }

.fe-time {
  font-size: 11px;
  color: var(--fleet-black-50);
  min-width: 100px;
}

.fe-label {
  flex: 1;
  color: var(--fleet-black);
}

/* Pinned devices */
.pinned-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.pinned-chip {
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

.pinned-chip:hover {
  border-color: var(--fleet-status-info);
}

.pinned-chip.active {
  background: var(--fleet-status-info);
  border-color: var(--fleet-status-info);
  color: var(--fleet-white);
}

.pinned-chip.active .pin-name { color: var(--fleet-white); }
.pinned-chip.active .pin-note { color: rgba(255, 255, 255, 0.7); }
.pinned-chip.active .pin-remove { color: rgba(255, 255, 255, 0.7); }
.pinned-chip.active .pin-remove:hover { color: var(--fleet-white); }

.pin-name { font-weight: 600; color: var(--fleet-black); }
.pin-note { color: var(--fleet-black-50); font-size: 11px; }

.pin-remove {
  border: none;
  background: none;
  color: var(--fleet-black-50);
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;
  line-height: 1;
  margin-left: 2px;
}

.pin-remove:hover { color: var(--status-critical); }

.pin-hint {
  font-size: 11px;
  color: var(--fleet-black-50);
  margin-top: 4px;
  font-style: italic;
}

/* ─── Score info + Impact explainer ────────────── */

.impact-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.impact-header-row h4 { margin-bottom: 0; }

.score-info-btn {
  font-size: 11px;
}

.score-info-box {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-medium);
  margin: var(--pad-small) 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--fleet-black);
}

.score-info-box p { margin: 0 0 6px; }

.si-categories {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 7px;
}

.si-cat {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}

.si-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.si-grades {
  font-size: 11px;
  padding: 4px 0;
  border-top: 1px solid var(--fleet-black-10);
}

.si-context {
  font-size: 10px;
  color: var(--fleet-black-50);
  font-style: italic;
  margin-bottom: 0;
}

/* ─── Impact explainer and verdict ─────────────── */

.impact-explainer {
  font-size: 11px;
  color: var(--fleet-black-50);
  margin-bottom: var(--pad-small);
  line-height: 1.5;
}

.impact-verdict {
  font-size: var(--font-size-sm);
  line-height: 1.5;
  padding: var(--pad-small) var(--pad-medium);
  border-radius: var(--radius);
  margin-top: var(--pad-small);
}

.verdict-neutral { background: var(--fleet-off-white); color: var(--fleet-black-50); }
.verdict-positive { background: var(--status-good-bg); color: var(--status-good-text); }
.verdict-negative { background: var(--status-critical-bg); color: var(--status-critical); }
.verdict-mixed { background: var(--status-fair-bg); color: var(--status-fair-text); }

/* ─── Impact summary ───────────────────────────── */

.impact-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pad-small);
}

.impact-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--pad-small) var(--pad-medium);
  background: var(--fleet-off-white);
  border-radius: var(--radius-large);
  min-width: 80px;
}

.impact-number {
  font-size: 18px;
  font-weight: 700;
  color: var(--fleet-black);
}

.impact-label {
  font-size: 10px;
  color: var(--fleet-black-50);
  text-align: center;
}

.row-selected { background: var(--info-tint-soft); }

/* ─── Device search for pinning ────────────────── */

.pin-search-wrap {
  position: relative;
  flex: 1;
  min-width: 180px;
  max-width: 280px;
}

.pin-search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  z-index: 10;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 4px;
}

.pin-search-result {
  display: flex;
  flex-direction: column;
  padding: 5px 9px;
  cursor: pointer;
  border-bottom: 1px solid var(--fleet-black-10);
  transition: background 0.1s;
}

.pin-search-result:last-child { border-bottom: none; }
.pin-search-result:hover { background: var(--info-tint-soft); }

.psr-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--fleet-black);
}

.psr-meta {
  font-size: 10px;
  color: var(--fleet-black-50);
}

/* ─── Rollout tracking ─────────────────────────── */

.rollout-btn {
  margin-top: var(--pad-small);
}

.rollout-panel {
  margin-top: var(--pad-small);
}

.rollout-summary {
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
  line-height: 1.5;
  margin-bottom: var(--pad-small);
}

.rollout-chart :deep(.chart) {
  height: 220px !important;
}

.rollout-chart :deep(.chart-container) {
  padding: var(--pad-small);
  box-shadow: none;
  border: 1px solid var(--fleet-black-10);
}

.affected-loading {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  padding: var(--pad-small) 0;
}

.ad-delta {
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.delta-bad { color: var(--status-critical); }
.delta-warn { color: var(--status-fair-text); }
.delta-good { color: var(--fleet-green); }
.delta-neutral { color: var(--fleet-black-50); }

/* ─── Device inspection panel ──────────────────── */

.device-inspect-panel {
  margin-top: var(--pad-small);
}

.inspect-chart {
  margin-bottom: var(--pad-medium);
}

.inspect-chart :deep(.chart) {
  height: 200px !important;
}

.inspect-chart :deep(.chart-container) {
  padding: var(--pad-small);
  box-shadow: none;
  border: none;
  background: transparent;
}

.inspect-patches h4 {
  font-size: 11px;
  font-weight: 700;
  color: var(--fleet-black);
  margin-bottom: var(--pad-small);
}

.patch-row {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  padding: 4px 0;
  font-size: var(--font-size-sm);
  border-bottom: 1px solid var(--fleet-black-10);
}

.patch-row:last-child { border-bottom: none; }

.patch-name {
  font-weight: 500;
  color: var(--fleet-black);
}

.patch-versions {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fleet-black-50);
}

/* Per-release rollout panel */
.timeline-entry.is-release .timeline-dot { box-shadow: 0 0 0 3px var(--status-fair-bg); }
.release-rollout-panel { margin-top: 10px; }
.rollout-rel {
  margin-left: 4px;
  color: var(--fleet-black-50);
  font-size: 10px;
}

/* Upstream FMA releases */
.fma-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 11px;
}
.fma-rollout { margin-top: 6px; }
</style>
