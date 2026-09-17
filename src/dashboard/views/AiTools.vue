<template>
  <div class="dashboard page-stack">
    <PageHeader
      title="AI tools"
      subtitle="Which AI tools are on the fleet, how they connect, and what carries a risk flag"
    />
    <AiToolsNav current="overview" />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Where the data came from ─────────────────────────── -->
    <div v-if="!unavailable && !error" class="source-line">
      <Chip v-if="isSnapshot" tone="fair" label="Snapshot" :value="snapshotLabel" />
      <Chip v-else-if="source === 'clickhouse'" tone="info" label="Live" :value="liveLabel" />
      <span v-if="ignoredFilters.length" class="source-note">
        The export has no platform, model or fleet columns — the {{ ignoredFilters.join(', ') }} filter{{ ignoredFilters.length === 1 ? ' is' : 's are' }} not applied here. Host search is.
      </span>
      <span v-else-if="isSnapshot" class="source-note">
        A point-in-time Fleet report, not live telemetry. Running / not-running reflects the moment the report was collected.
      </span>
      <span v-else-if="coverage" class="source-note">
        Latest scan per host, hosts scanned in the last {{ windowDays }} days.<template v-if="deviceCount && scannedHosts"> The scan reached {{ scannedHosts }} of the {{ deviceCount }} hosts the board knows in this selection.</template> Hosts report roughly hourly; a host with nothing to report still counts as scanned.
      </span>
    </div>

    <!-- ─── Not wired yet ────────────────────────────────────── -->
    <EmptyState
      v-if="unavailable"
      title="AI tool inventory isn't wired up yet"
      info="The AI discovery queries run in Fleet, but their results are not in ClickHouse and no local export is available. Locally: copy the Fleet report CSV to local-data/ai-inventory.csv and restart the dev server."
    />

    <template v-else>
      <!-- ─── Answer — the governance reading ───────────────────── -->
      <section class="ai-hero">
        <div class="hero-block">
          <span class="hero-eyebrow">AI risk — preliminary</span>
          <div class="hero-grade-row">
            <GradeBadge v-if="!loading && risk.grade" :grade="risk.grade" class="hero-grade" />
            <span v-else class="hero-count">—</span>
            <div class="hero-grade-text">
              <span class="hero-score">{{ loading || risk.score == null ? '—' : risk.score }}<span class="hero-score-of">/100</span></span>
              <span class="hero-count-of">{{ summary.hosts }} of {{ risk.denominator || summary.hosts }} {{ scannedHosts ? 'scanned' : '' }} hosts with AI tooling</span>
            </div>
          </div>
          <span v-if="!loading" class="hero-chip" :title="riskFormula">{{ summary.risk.flagged }} flagged of {{ summary.findings.toLocaleString() }} findings · hover for the formula</span>
        </div>
        <div class="hero-narrative">
          <p class="hero-headline">
            <template v-if="loading">Loading the inventory…</template>
            <template v-else-if="!summary.hosts">No AI tooling findings in this selection.</template>
            <template v-else-if="!summary.risk.flaggedHosts">
              <span class="hl-good">No finding carries a risk flag</span> across {{ summary.hosts }} hosts.
            </template>
            <template v-else>
              <span :class="summary.risk.hostsBySeverity.critical ? 'hl-bad' : 'hl-fair'">{{ summary.risk.flagged }} flagged finding{{ summary.risk.flagged === 1 ? '' : 's' }} on {{ summary.risk.flaggedHosts }} host{{ summary.risk.flaggedHosts === 1 ? '' : 's' }}</span><template v-if="summary.risk.bySeverity.critical">, {{ summary.risk.bySeverity.critical }} critical<template v-if="criticalFlagLabels"> — {{ criticalFlagLabels }}</template></template>.
              <template v-if="newCriticalThisWeek"> {{ newCriticalThisWeek }} of the critical ones appeared in the last 7 days.</template>
            </template>
          </p>
          <p v-if="!loading && summary.hosts" class="hero-support">
            {{ gov.known.tools }} known product{{ gov.known.tools === 1 ? '' : 's' }} on {{ gov.known.hosts }} host{{ gov.known.hosts === 1 ? '' : 's' }}, {{ gov.explorative.tools }} explorative on {{ gov.explorative.hosts }}, {{ gov.local.tools }} self-hosted and {{ gov.mcp.servers }} MCP server{{ gov.mcp.servers === 1 ? '' : 's' }}<template v-if="gov.mcp.servers"> ({{ gov.mcp.localProcess }} local process, {{ gov.mcp.loopback }} loopback, {{ gov.mcp.remote }} remote)</template>.
            <template v-if="summary.network.hosts">{{ ' ' }}{{ summary.network.hosts }} host{{ summary.network.hosts === 1 ? ' had' : 's had' }} a live AI API connection at last scan.</template>
          </p>
        </div>
        <div class="hero-rail">
          <span class="hero-eyebrow">Hosts by worst flag</span>
          <div class="hero-rail-list">
            <div class="hero-rail-row" :class="{ 'hero-rail-row--bad': summary.risk.hostsBySeverity.critical }"><span>Critical</span><span class="hero-rail-count">{{ loading ? '—' : summary.risk.hostsBySeverity.critical }}</span></div>
            <div class="hero-rail-row" :class="{ 'hero-rail-row--warn': summary.risk.hostsBySeverity.elevated }"><span>Elevated</span><span class="hero-rail-count">{{ loading ? '—' : summary.risk.hostsBySeverity.elevated }}</span></div>
            <div class="hero-rail-row"><span>Fair</span><span class="hero-rail-count">{{ loading ? '—' : summary.risk.hostsBySeverity.fair }}</span></div>
            <div class="hero-rail-row"><span>No flags</span><span class="hero-rail-count">{{ loading ? '—' : cleanHosts }}</span></div>
          </div>
        </div>
      </section>

      <!-- ─── Findings — the worklist ──────────────────────────── -->
      <section class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">Findings — what to fix</h2>
          <div class="work-controls">
            <span class="grammar-hint">{{ worklist.length }} shown · click a row to open its host</span>
            <button type="button" class="work-btn" :class="{ 'work-btn--on': showFair }" @click="showFair = !showFair">{{ showFair ? 'Hide fair' : `Show fair (${fairCount})` }}</button>
            <button type="button" class="work-btn" :disabled="!worklist.length" @click="exportWorklist">Export CSV</button>
          </div>
        </div>
        <ChartCard title="Findings by worst flag" :loading="loading" :empty="!summary.findings">
          <DistributionStrip :data="severityDist" nameKey="name" valueKey="value" :order="SEVERITY_DIST_ORDER" :tones="SEVERITY_DIST_TONES" />
        </ChartCard>
        <div v-if="!loading && summary.risk.flags.length" class="flag-chips">
          <button
            v-for="f in summary.risk.flags"
            :key="f.flag"
            type="button"
            class="flag-chip"
            :class="['flag-chip--' + f.severity, { 'flag-chip--on': activeFlag === f.flag, 'flag-chip--dim': f.severity === 'fair' && !showFair && activeFlag !== f.flag }]"
            :title="f.description"
            @click="activeFlag = activeFlag === f.flag ? '' : f.flag"
          >
            <span class="flag-chip-label">{{ f.label }}</span>
            <span class="flag-chip-count">{{ f.findings }}</span>
          </button>
        </div>
        <p v-if="activeFlagInfo" class="flag-active">
          <Badge :tone="SEVERITY_TONE[activeFlagInfo.severity]" :label="activeFlagInfo.severity" />
          <span><strong>{{ activeFlagInfo.label }}.</strong> {{ activeFlagInfo.description }}
            <template v-if="activeFlagInfo.caveat && (activeFlagInfo.unverified || activeFlagInfo.waived)"> <span class="flag-caveat-inline">{{ activeFlagInfo.unverified ? `${activeFlagInfo.unverified} finding(s) have no recorded endpoint host. ` : '' }}{{ activeFlagInfo.waived ? `${activeFlagInfo.waived} loopback finding(s) waived. ` : '' }}{{ activeFlagInfo.caveat }}</span></template>
            <template v-if="activeFlagInfo.uncatalogued"> Uncatalogued flag — severity defaults to fair.</template>
          </span>
        </p>
        <DataTable
          :data="worklist"
          :columns="worklistColumns"
          :loading="loading"
          density="compact"
          :clickable="!wcMode && worklist.some(r => r.hostId)"
          defaultSortKey="severity_rank"
          :maxRows="WORKLIST_MAX"
          @row-click="openHost"
        />
        <p v-if="worklist.length > WORKLIST_MAX" class="section-caption">Showing the first {{ WORKLIST_MAX }} of {{ worklist.length }} findings — narrow with a flag chip or export the CSV.</p>
        <p v-else-if="!loading && !worklist.length" class="section-caption">{{ summary.risk.flagged ? 'Only fair-severity findings remain — show fair to list them.' : 'No finding in this selection carries a risk flag.' }}</p>
        <p v-if="!loading && summary.findings" class="section-caption risk-formula">Preliminary rating: {{ riskFormula }}</p>
      </section>

      <!-- ─── Governance — the three tiers ─────────────────────── -->
      <section class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">Governance — known, explorative, local</h2>
          <span class="grammar-hint">"Known" is a recognisability list of {{ gov.knownVendors.length }} mainstream vendors, not an approval list — expert mode shows it</span>
        </div>
        <div class="tier-grid">
          <article class="tier-card tier-card--known">
            <header class="tier-head">
              <span class="tier-eyebrow">Known products</span>
              <span class="tier-count">{{ loading ? '—' : gov.known.tools }}</span>
              <span class="tier-sub">on {{ gov.known.hosts }} host{{ gov.known.hosts === 1 ? '' : 's' }} · {{ gov.known.vendors.length }} vendor{{ gov.known.vendors.length === 1 ? '' : 's' }}</span>
            </header>
            <BarList :data="gov.known.list" nameKey="key" valueKey="hosts" :humanize="false" :maxRows="8" color="var(--status-good-soft)" />
            <p v-if="expertMode" class="tier-note">Known vendors: {{ gov.knownVendors.join(', ') }}<template v-if="!config.knownAiVendors"> (board default — set KNOWN_AI_VENDORS to replace)</template>.</p>
          </article>
          <article class="tier-card tier-card--explorative">
            <header class="tier-head">
              <span class="tier-eyebrow">Explorative tools</span>
              <span class="tier-count">{{ loading ? '—' : gov.explorative.tools }}</span>
              <span class="tier-sub">on {{ gov.explorative.hosts }} host{{ gov.explorative.hosts === 1 ? '' : 's' }} · {{ gov.explorative.vendors.length }} vendor{{ gov.explorative.vendors.length === 1 ? '' : 's' }}</span>
            </header>
            <BarList :data="gov.explorative.list" nameKey="key" valueKey="hosts" :humanize="false" :maxRows="8" color="var(--status-fair)" />
            <p v-if="!gov.explorative.tools && !loading" class="tier-note">Every hosted AI tool found is from a known vendor.</p>
          </article>
          <article class="tier-card tier-card--local">
            <header class="tier-head">
              <span class="tier-eyebrow">Local &amp; self-hosted</span>
              <span class="tier-count">{{ loading ? '—' : gov.local.tools + gov.mcp.servers }}</span>
              <span class="tier-sub">{{ gov.local.tools }} tool{{ gov.local.tools === 1 ? '' : 's' }} on {{ gov.local.hosts }} host{{ gov.local.hosts === 1 ? '' : 's' }} · {{ gov.mcp.servers }} MCP server{{ gov.mcp.servers === 1 ? '' : 's' }} on {{ gov.mcp.hosts }}</span>
            </header>
            <BarList :data="gov.local.list" nameKey="key" valueKey="hosts" :humanize="false" :maxRows="5" color="var(--fleet-vibrant-blue)" />
            <div class="tier-mcp">
              <div class="tier-mcp-row"><span>MCP as local process</span><strong>{{ loading ? '—' : gov.mcp.localProcess }}</strong></div>
              <div class="tier-mcp-row"><span>MCP on loopback</span><strong>{{ loading ? '—' : gov.mcp.loopback }}</strong></div>
              <div class="tier-mcp-row"><span>MCP reaching remote endpoints</span><strong>{{ loading ? '—' : gov.mcp.remote }}</strong></div>
            </div>
          </article>
        </div>
      </section>

      <!-- ─── Who — vendors ────────────────────────────────────── -->
      <section class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">Who — vendors on the fleet</h2>
          <span class="grammar-hint">Hosts with at least one app, CLI agent, IDE plugin, extension or live connection from the vendor</span>
        </div>
        <div class="charts-row two-col">
          <ChartCard title="Hosts per vendor" :loading="loading" :empty="!summary.vendors.length">
            <BarList :data="summary.vendors" nameKey="key" valueKey="hosts" :humanize="false" :maxRows="12" />
          </ChartCard>
          <ChartCard title="Live AI API connections at last scan, by tool" :loading="loading" :empty="!summary.network.byTool.length" emptyText="No established AI connection at the latest scan">
            <BarList :data="summary.network.byTool" nameKey="key" valueKey="hosts" :humanize="false" :maxRows="12" color="var(--status-good-soft)" />
          </ChartCard>
        </div>
      </section>

      <!-- ─── What — surfaces ──────────────────────────────────── -->
      <section class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">What — discovery surfaces</h2>
          <span class="grammar-hint">One row per osquery table the discovery pack reads</span>
        </div>
        <DataTable
          :data="surfaceRows"
          :columns="surfaceColumns"
          :loading="loading"
          density="compact"
          defaultSortKey="hosts"
          :defaultSortAsc="false"
        />
      </section>

      <!-- ─── Drill panel — shared by flags, servers and hosts ─── -->
      <DrillPanel v-if="drill" :title="drill.title" @close="drill = null">
        <template #actions>
          <a v-if="drill.fleetLink" :href="drill.fleetLink" target="_blank" rel="noopener" class="custom-link drill-fleet-link">Open in Fleet</a>
        </template>
        <p v-if="drill.caption" class="section-caption">{{ drill.caption }}</p>
        <DataTable
          :data="drill.rows"
          :columns="drill.columns"
          density="compact"
          defaultSortKey="severity_rank"
          :maxRows="DRILL_MAX"
          :clickable="!wcMode && drill.rows.some(r => r.hostId)"
          @row-click="openHost"
        />
        <p v-if="!wcMode && drill.rows.some(r => r.hostId)" class="section-caption">Click a finding to open its host.</p>
        <p v-if="drill.rows.length > DRILL_MAX" class="section-caption">Showing the first {{ DRILL_MAX }} of {{ drill.rows.length }} findings.</p>
      </DrillPanel>

      <!-- ─── MCP servers ──────────────────────────────────────── -->
      <section class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">MCP servers</h2>
          <span class="grammar-hint">Found in client config files and as running processes; folded by name across versions</span>
        </div>
        <div class="metrics-row four-col">
          <MetricCard label="Distinct servers" :value="summary.mcp.servers" :loading="loading" />
          <MetricCard label="Hosts with MCP" :value="summary.mcp.hosts" :loading="loading" />
          <MetricCard label="Remote endpoints" :value="summary.mcp.remote" :loading="loading" :subtitle="remoteSubtitle" />
          <MetricCard label="With secrets in env" :value="summary.mcp.withSecrets" :loading="loading" subtitle="config passes API keys" />
        </div>
        <DataTable
          :data="serverRows"
          :columns="serverColumns"
          :loading="loading"
          density="compact"
          :clickable="!wcMode"
          defaultSortKey="severity_rank"
          @row-click="drillServer"
        />
      </section>

      <!-- ─── Agent instruction files ──────────────────────────── -->
      <section class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">Agent instruction files</h2>
          <span class="grammar-hint">CLAUDE.md, AGENTS.md and their kin — text an agent obeys, so what they contain matters</span>
        </div>
        <div class="metrics-row four-col">
          <MetricCard label="Files" :value="summary.instructions.files" :loading="loading" />
          <MetricCard label="Hosts" :value="summary.instructions.hosts" :loading="loading" />
          <MetricCard label="Flagged" :value="summary.instructions.flagged" :loading="loading" subtitle="injection markers, hidden unicode, writable" />
          <MetricCard label="User-scoped" :value="summary.instructions.userScoped" :loading="loading" subtitle="apply to every project on the host" />
        </div>
        <div class="charts-row two-col">
          <ChartCard title="Files per agent" :loading="loading" :empty="!summary.instructions.byAgent.length">
            <BarList :data="summary.instructions.byAgent" nameKey="key" valueKey="findings" :maxRows="10" />
          </ChartCard>
          <ChartCard title="Hosts per file name" :loading="loading" :empty="!summary.instructions.byFile.length">
            <BarList :data="summary.instructions.byFile" nameKey="key" valueKey="hosts" :humanize="false" :maxRows="10" />
          </ChartCard>
        </div>
      </section>

      <!-- ─── Network — egress and local listeners ─────────────── -->
      <section class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">Network</h2>
          <span class="grammar-hint">Established connections from AI processes, and local inference or agent ports listening</span>
        </div>
        <div class="charts-row two-col">
          <ChartCard title="Hosts with live AI connections, by remote endpoint" :loading="loading" :empty="!egressEndpoints.length" emptyText="No established AI connection at the latest scan">
            <BarList :data="egressEndpoints" nameKey="key" valueKey="hosts" :humanize="false" :maxRows="10" />
          </ChartCard>
          <ChartCard title="Local listeners" :loading="loading" :empty="!summary.network.listeners.length" emptyText="No AI process was listening on a local port">
            <ul class="listener-list">
              <li v-for="l in summary.network.listeners" :key="l.key" class="listener-row">
                <span class="listener-tool">{{ l.tool }}</span>
                <span class="listener-addr mono">{{ l.address || '*' }}:{{ l.port ?? '—' }}</span>
                <span class="listener-cat">{{ humanizeToken(l.category) }}</span>
                <span v-if="!wcMode" class="listener-host">{{ hostLabel(l.host) }}</span>
              </li>
            </ul>
          </ChartCard>
        </div>
      </section>

      <!-- ─── Hosts — hidden in Workers Council mode ───────────── -->
      <section v-if="!wcMode" class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">Hosts</h2>
          <span class="grammar-hint">Worst flag first. Click a host to open its page<template v-if="isSnapshot"> (in a CSV snapshot, for every finding on it)</template>.</span>
        </div>
        <DataTable
          :data="hostRows"
          :columns="hostColumns"
          :loading="loading"
          density="compact"
          clickable
          defaultSortKey="severity_rank"
          @row-click="drillHost"
        />
      </section>
      <p v-else class="section-caption">Per-host detail is withheld in Workers Council mode.</p>

      <!-- ─── Expert — every finding ───────────────────────────── -->
      <section v-if="expertMode" class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">All findings</h2>
          <span class="grammar-hint">The raw rows behind every number above</span>
        </div>
        <div class="findings-controls">
          <Tabs v-model="findingsType" :options="findingsTypeOptions" variant="underline" />
          <SearchInput v-model="findingsFilter" placeholder="Filter findings…" />
        </div>
        <DataTable
          :data="findingRows"
          :columns="findingColumns"
          :loading="loading"
          density="compact"
          :filter="findingsFilter"
          defaultSortKey="severity_rank"
          :maxRows="FINDINGS_MAX"
        />
        <p v-if="findingRows.length > FINDINGS_MAX" class="section-caption">Showing the first {{ FINDINGS_MAX }} of {{ findingRows.length.toLocaleString() }} matching rows — narrow with the filter.</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import DataTable from '../components/DataTable.vue'
import MetricCard from '../components/MetricCard.vue'
import Badge from '../components/base/Badge.vue'
import BarList from '../components/base/BarList.vue'
import ChartCard from '../components/base/ChartCard.vue'
import Chip from '../components/base/Chip.vue'
import DistributionStrip from '../components/base/DistributionStrip.vue'
import DrillPanel from '../components/base/DrillPanel.vue'
import EmptyState from '../components/base/EmptyState.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SearchInput from '../components/base/SearchInput.vue'
import Tabs from '../components/base/Tabs.vue'
import AiToolsNav from '../components/ai/AiToolsNav.vue'
import { useAiInventory } from '../composables/useAiInventory'
import GradeBadge from '../components/GradeBadge.vue'
import { summarize, mcpServers, hostRollup, governance, flagInfo, isLoopback, fleetRiskRating, gradeOf, RISK_WEIGHTS, SURFACES, SEVERITY_ORDER, SEVERITY_TONE } from '../composables/aiInventory'
import { useFleetFilter } from '../composables/useFleetFilter'
import { useWorkersCouncil } from '../composables/useWorkersCouncil'
import { useExpertMode } from '../composables/useExpertMode'
import { useAppConfig } from '../composables/useAppConfig'
import { displayHost } from '../composables/displayName'
import { isMasked } from '../composables/useDemoMode'
import { humanizeToken } from '../composables/humanize'

const DRILL_MAX = 200
const WORKLIST_MAX = 150
const FINDINGS_MAX = 300

const SEVERITY_DIST_ORDER = ['critical', 'elevated', 'fair', 'clean']
const SEVERITY_DIST_TONES = { critical: 'critical', elevated: 'elevated', fair: 'fair', clean: 'good' }
const SEVERITY_RANK = { critical: 0, elevated: 1, fair: 2 }
const rankOf = s => (s ? SEVERITY_RANK[s] : 9)
const severityTone = s => (s ? SEVERITY_TONE[s] : null)

const router = useRouter()
const { filterParams, deviceCount } = useFleetFilter()
const { wcMode } = useWorkersCouncil()
const { expertMode } = useExpertMode()
const { config } = useAppConfig()
const { rows, loading, error, unavailable, source, sourceMeta, coverage, ignoredFilters, isSnapshot, load } = useAiInventory()
const windowDays = 7

// ─── Roll-ups ────────────────────────────────────────────────────
const summary = computed(() => summarize(rows.value))
// The known-vendor list comes from /api/config when the deployment sets one,
// else the board default. Either way the page names the list in expert mode.
const gov = computed(() => governance(rows.value, config.value.knownAiVendors ? { knownVendors: config.value.knownAiVendors } : {}))
const scannedHosts = computed(() => Number(coverage.value?.hosts_scanned) || 0)

// ─── Preliminary risk rating ─────────────────────────────────────
const risk = computed(() => fleetRiskRating(summary.value, scannedHosts.value))
const riskFormula = computed(() => {
  const w = RISK_WEIGHTS.fleet
  const sh = risk.value.shares
  const pct = v => `${Math.round((v || 0) * 100)}%`
  return `100 − (${w.critical} × share of hosts whose worst flag is critical${sh ? ` [${pct(sh.critical)}]` : ''} + ${w.elevated} × elevated${sh ? ` [${pct(sh.elevated)}]` : ''} + ${w.fair} × fair${sh ? ` [${pct(sh.fair)}]` : ''}), over ${risk.value.denominator} ${scannedHosts.value ? 'scanned' : 'reporting'} hosts. Weights are judgement, not calibration.`
})
// "Appeared in the last 7 days" is only a statement once the history is
// older than 7 days; before that every finding is "new" and the sentence is
// an artefact of when scanning started. historyDays gates it.
const historyDays = computed(() => {
  const first = coverage.value?.first_scan_ever
  return first ? dayjs().diff(dayjs(first), 'day') : 0
})
const newCriticalThisWeek = computed(() => {
  if (historyDays.value < 7) return 0
  const cutoff = dayjs().subtract(7, 'day')
  return rows.value.filter(r => r.severity === 'critical' && r.firstSeen && dayjs(r.firstSeen).isAfter(cutoff)).length
})

// ─── Worklist ────────────────────────────────────────────────────
const showFair = ref(false)
const activeFlag = ref('')
const activeFlagInfo = computed(() => summary.value.risk.flags.find(f => f.flag === activeFlag.value) || null)
const fairCount = computed(() => rows.value.filter(r => r.severity === 'fair').length)
const worklistColumns = computed(() => [
  ...(wcMode.value ? [] : [{ key: 'host_label', label: 'Host' }]),
  { key: 'severity_label', label: 'Severity', tone: (v, r) => severityTone(r.severity) },
  { key: 'flags_label', label: 'Flags' },
  { key: 'tool', label: 'Server / tool' },
  { key: 'surface', label: 'Surface' },
  { key: 'file_label', label: 'File' },
  { key: 'env_label', label: 'Env keys passed' },
  { key: 'running_label', label: 'Process seen' },
  { key: 'first_seen_label', label: historyDays.value < 7 ? `First seen (history ${historyDays.value}d)` : 'First seen', type: 'datetime' },
  ...(expertMode.value ? [{ key: 'path_label', label: 'Path' }] : []),
])
const worklist = computed(() => rows.value
  .filter(r => r.flags.length)
  .filter(r => showFair.value || r.severity !== 'fair' || activeFlag.value)
  .filter(r => !activeFlag.value || r.flags.includes(activeFlag.value))
  .map(r => ({
    ...toFinding(r),
    // What to open: the config file for MCP/instructions; the browser profile
    // for an extension (its path ends in manifest.json, which says nothing).
    file_label: r.type === 'browser_extension' ? [r.detail.browser, r.detail.profile].filter(Boolean).join(' · ') || '—' : (r.configFile || '—'),
    tool: r.type === 'browser_extension' && r.version ? `${r.tool} ${r.version}` : r.tool,
    env_label: parseEnvKeys(r.detail.env_keys).join(', ') || '—',
    first_seen_label: r.firstSeen || null,
  })))
function parseEnvKeys(v) {
  if (!v) return []
  if (Array.isArray(v)) return v
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
}
function exportWorklist() {
  if (!worklist.value.length) return
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const cols = ['host', 'host_id', 'severity', 'flags', 'tool', 'surface', 'file', 'env_keys', 'process_seen', 'first_seen', 'path']
  const lines = [cols.join(','), ...worklist.value.map(r => [
    wcMode.value ? '' : r.host_label, wcMode.value ? '' : (r.hostId || ''), r.severity_label, r.flags_label, r.tool, r.surface,
    r.file_label, r.env_label, r.running_label, r.first_seen_label || '', r.path_label,
  ].map(esc).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ai-findings-${activeFlag.value || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
const liveLabel = computed(() => {
  const c = coverage.value
  if (!c) return 'ClickHouse'
  const when = c.latest_scan ? dayjs(c.latest_scan).format('YYYY-MM-DD HH:mm') : null
  return [`${Number(c.hosts_scanned).toLocaleString()} hosts scanned`, when ? `latest scan ${when}` : null].filter(Boolean).join(' · ')
})
// Established AI connections grouped by remote host:port — the IPs are what
// the socket saw; no reverse lookup is attempted.
const egressEndpoints = computed(() => {
  const m = new Map()
  for (const r of rows.value) {
    if (r.type !== 'sockets' || r.source === 'listen' || !r.targetEndpoint) continue
    let e = m.get(r.targetEndpoint)
    if (!e) { e = { key: r.targetEndpoint, hosts: new Set() }; m.set(r.targetEndpoint, e) }
    e.hosts.add(r.host)
  }
  return Array.from(m.values()).map(e => ({ key: e.key, hosts: e.hosts.size }))
})
const servers = computed(() => mcpServers(rows.value))
const hosts = computed(() => hostRollup(rows.value))

const surfacesWithData = computed(() => summary.value.surfaces.filter(s => s.findings > 0).length)
const cleanHosts = computed(() => Math.max(0, summary.value.hosts - summary.value.risk.flaggedHosts))
const criticalFlagLabels = computed(() =>
  summary.value.risk.flags.filter(f => f.severity === 'critical').map(f => f.label.toLowerCase()).join(', ')
)
// "Remote" means the endpoint leaves the machine. The query records no host
// for http/sse servers today, so the count is an upper bound and says so.
const remoteSubtitle = computed(() => {
  const m = summary.value.mcp
  if (m.endpointUnknown) return `http or sse; ${m.endpointUnknown} without a recorded host`
  if (m.loopback) return `http or sse; ${m.loopback} loopback excluded`
  return 'http or sse transport'
})
const severityDist = computed(() =>
  Object.entries(summary.value.risk.bySeverity).map(([name, value]) => ({ name, value }))
)
const snapshotLabel = computed(() => {
  const m = sourceMeta.value || {}
  const when = m.modified ? dayjs(m.modified).format('YYYY-MM-DD HH:mm') : null
  return [m.rows != null ? `${Number(m.rows).toLocaleString()} rows` : null, when ? `file modified ${when}` : null].filter(Boolean).join(' · ') || 'local CSV export'
})

// ─── Display helpers ─────────────────────────────────────────────
// The export identifies hosts by display name only, so that is both the
// pseudonym key and the label. Paths embed the user's home directory, which
// is a name too — masked alongside the host in demo mode.
const hostLabel = host => displayHost({ computer_name: host })
const maskPath = p => {
  if (!p) return ''
  if (!isMasked('hosts')) return p
  return String(p).replace(/\/Users\/[^/]+/, '/Users/•••').replace(/\\Users\\[^\\]+/, '\\Users\\•••')
}
// Worst flag first: DataTable truncates long cells, and a critical flag must
// not be the part that falls off the end.
const flagLabels = flags => (flags || []).slice()
  .sort((a, b) => rankOf(flagInfo(a).severity) - rankOf(flagInfo(b).severity))
  .map(f => flagInfo(f).label).join(', ')
const fleetHostLink = host => {
  if (isMasked('hosts')) return null
  const base = (config.value.fleetUrl || '').replace(/\/$/, '')
  return base ? `${base}/hosts/manage?search=${encodeURIComponent(host)}` : null
}

// ─── Surfaces table ──────────────────────────────────────────────
const surfaceColumns = [
  { key: 'label', label: 'Surface' },
  { key: 'findings', label: 'Findings', type: 'number', align: 'right' },
  { key: 'hosts', label: 'Hosts', type: 'number', align: 'right' },
  { key: 'flagged', label: 'Flagged', type: 'number', align: 'right', tone: v => (Number(v) > 0 ? 'elevated' : null) },
]
const surfaceRows = computed(() =>
  summary.value.surfaces.filter(s => s.findings > 0).map(s => ({
    ...s,
    flagged: rows.value.filter(r => r.type === s.type && r.flags.length).length,
  }))
)

// ─── MCP servers table ───────────────────────────────────────────
const serverColumns = computed(() => [
  { key: 'name', label: 'Server' },
  { key: 'severity_label', label: 'Severity', tone: (v, r) => severityTone(r.severity) },
  { key: 'hosts', label: 'Hosts', type: 'number', align: 'right' },
  { key: 'clients_label', label: 'Clients' },
  { key: 'transport_label', label: 'Transport' },
  { key: 'endpoint_label', label: 'Endpoint' },
  { key: 'scope_label', label: 'Scope' },
  { key: 'running_label', label: 'Process seen' },
  { key: 'flags_label', label: 'Flags' },
  ...(expertMode.value ? [
    { key: 'env_label', label: 'Env keys' },
    { key: 'command_label', label: 'Command' },
    { key: 'discovery_label', label: 'Found via' },
  ] : []),
])
const serverRows = computed(() => servers.value.map(s => ({
  ...s,
  severity_rank: rankOf(s.severity),
  severity_label: s.severity || 'none',
  clients_label: s.clients.join(', ') || (s.discovery.includes('process') ? 'process only' : '—'),
  transport_label: s.transports.join(', ') || '—',
  endpoint_label: s.endpointHosts.length ? s.endpointHosts.map(h => isLoopback(h) ? `${h} (loopback)` : h).join(', ')
    : s.endpointUnknown ? 'not recorded' : s.transports.some(t => t === 'stdio') ? 'local process' : '—',
  scope_label: s.scopes.join(', ') || '—',
  running_label: s.running ? 'yes' : (s.discovery.length ? 'config only' : '—'),
  flags_label: (flagLabels(s.flags) || '—') + (s.waivedFlags.length ? ` (waived: ${flagLabels(s.waivedFlags)})` : ''),
  env_label: s.envKeys.join(', ') || '—',
  command_label: s.commands.map(maskPath).join(' | ') || '—',
  discovery_label: s.discovery.join(', ') || '—',
})))

// ─── Hosts table ─────────────────────────────────────────────────
const hostColumns = [
  { key: 'host_label', label: 'Host' },
  { key: 'risk_label', label: 'Risk', tone: (v, r) => (r.riskScore < 60 ? 'critical' : r.riskScore < 90 ? 'elevated' : 'good') },
  { key: 'severity_label', label: 'Worst flag', tone: (v, r) => severityTone(r.severity) },
  { key: 'flagged', label: 'Flagged', type: 'number', align: 'right' },
  { key: 'mcp', label: 'MCP', type: 'number', align: 'right' },
  { key: 'instructions', label: 'Instructions', type: 'number', align: 'right' },
  { key: 'extensions', label: 'Extensions', type: 'number', align: 'right' },
  { key: 'idePlugins', label: 'IDE plugins', type: 'number', align: 'right' },
  { key: 'apps', label: 'Apps', type: 'number', align: 'right' },
  { key: 'agents', label: 'CLI agents', type: 'number', align: 'right' },
  { key: 'connections', label: 'Connections', type: 'number', align: 'right' },
  { key: 'vendors_label', label: 'Vendors' },
]
const hostRows = computed(() => hosts.value.map(h => ({
  ...h,
  host_label: hostLabel(h.host),
  risk_label: `${gradeOf(h.riskScore)} · ${h.riskScore}`,
  severity_rank: rankOf(h.severity),
  severity_label: h.severity || 'none',
  vendors_label: h.vendors.join(', ') || '—',
})))

// ─── Findings (drill + expert) ───────────────────────────────────
const findingColumnsBase = [
  { key: 'host_label', label: 'Host' },
  { key: 'surface', label: 'Surface' },
  { key: 'tool', label: 'Tool' },
  { key: 'name', label: 'Name' },
  { key: 'severity_label', label: 'Severity', tone: (v, r) => severityTone(r.severity) },
  { key: 'flags_label', label: 'Flags' },
  { key: 'source', label: 'Source' },
  { key: 'location', label: 'Location' },
  { key: 'version', label: 'Version' },
  { key: 'running_label', label: 'Running' },
  { key: 'path_label', label: 'Path' },
]
const findingColumns = computed(() => (wcMode.value ? findingColumnsBase.filter(c => c.key !== 'host_label') : findingColumnsBase))
const toFinding = r => ({
  ...r,
  host_label: hostLabel(r.host),
  severity_rank: rankOf(r.severity),
  severity_label: r.severity || 'none',
  flags_label: flagLabels(r.flags) || '—',
  running_label: r.running == null ? '—' : r.running ? 'yes' : 'no',
  path_label: maskPath(r.path) || '—',
})

const findingsType = ref('')
const findingsFilter = ref('')
const findingsTypeOptions = computed(() => [
  { value: '', label: 'All', count: rows.value.length },
  ...SURFACES.filter(s => summary.value.surfaces.find(x => x.type === s.type)?.findings)
    .map(s => ({ value: s.type, label: s.short, count: summary.value.surfaces.find(x => x.type === s.type).findings })),
])
const findingRows = computed(() =>
  rows.value.filter(r => !findingsType.value || r.type === findingsType.value).map(toFinding)
)

// ─── Drill panel ─────────────────────────────────────────────────
// One panel, three entry points. Flag and server drills stay available in
// Workers Council mode with the host column removed — the finding itself is
// not attribution; the host drill is, so it is not offered there.
const drill = ref(null)
function drillServer(s) {
  if (wcMode.value) return
  if (drill.value?.id === 'server:' + s.key) { drill.value = null; return }
  drill.value = {
    id: 'server:' + s.key,
    title: `${s.name} — ${s.hosts} host${s.hosts === 1 ? '' : 's'}`,
    caption: s.flags.length ? flagLabels(s.flags) : null,
    columns: findingColumnsBase.filter(c => !['tool', 'surface'].includes(c.key)),
    rows: s.rows.map(toFinding),
  }
}
// Live rows carry host_id, so a host click goes to the host page, whose AI
// section shows the same findings. The CSV export has no id — there the
// click opens the in-page drill instead.
function openHost(h) {
  if (h?.hostId) router.push(`/hosts/${h.hostId}`)
}
function drillHost(h) {
  if (wcMode.value) return
  if (h.hostId) { openHost(h); return }
  if (drill.value?.id === 'host:' + h.host) { drill.value = null; return }
  drill.value = {
    id: 'host:' + h.host,
    title: `${hostLabel(h.host)} — ${h.findings} finding${h.findings === 1 ? '' : 's'}`,
    caption: h.runningTools.length ? `Running at collection time: ${h.runningTools.join(', ')}` : (h.connections ? `${h.connections} live AI connection${h.connections === 1 ? '' : 's'} at last scan` : null),
    fleetLink: fleetHostLink(h.host),
    columns: findingColumnsBase.filter(c => c.key !== 'host_label'),
    rows: h.rows.map(toFinding),
  }
}
// A refetch (filter change, mode flip) invalidates whatever was open.
watch(rows, () => { drill.value = null })

onMounted(() => load({ ...filterParams.value }))
watch(filterParams, () => load({ ...filterParams.value }), { deep: true })
</script>

<style scoped>
.section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}

.source-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--pad-small) var(--pad-medium);
}
.source-note {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
}

/* ─── Briefing hero — same grammar as Connectivity ─── */
.ai-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-xlarge) 32px;
  display: grid;
  grid-template-columns: 280px 1fr 260px;
  gap: 40px;
  align-items: center;
  color: var(--fleet-white);
}
.hero-eyebrow { font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black-50); letter-spacing: 0.4px; text-transform: uppercase; }
.hero-block { display: flex; flex-direction: column; gap: 8px; }
.hero-count-row { display: flex; align-items: baseline; gap: 12px; }
.hero-count { font-size: 56px; font-weight: 700; line-height: 0.9; }
.hero-count-of { font-size: 15px; color: var(--fleet-black-33); }
.hero-chip { display: inline-flex; align-self: flex-start; padding: 3px 9px; border-radius: var(--radius); background: rgba(255,255,255,0.1); color: var(--fleet-black-10); font-size: var(--font-size-sm); font-weight: 600; }
.hero-narrative { display: flex; flex-direction: column; gap: 12px; border-left: 1px solid var(--fleet-blue); padding-left: 40px; }
.hero-headline { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.35; text-wrap: pretty; }
.hl-good { color: var(--status-good-soft); }
.hl-fair { color: var(--status-fair); }
.hl-bad { color: var(--status-critical-soft); }
.hl-info { color: var(--fleet-vibrant-blue); }
.hero-grade-row { display: flex; align-items: center; gap: 14px; }
.hero-grade { transform: scale(1.35); transform-origin: left center; margin-right: 10px; }
.hero-grade-text { display: flex; flex-direction: column; gap: 4px; }
.hero-score { font-size: 30px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.hero-score-of { font-size: 14px; color: var(--fleet-black-33); font-weight: 500; }

/* ─── Worklist ─── */
.work-controls { display: flex; align-items: center; gap: var(--pad-small); flex-wrap: wrap; }
.work-btn { padding: 5px 10px; border: 1px solid var(--fleet-black-10); border-radius: var(--radius); background: var(--fleet-white); color: var(--fleet-black-75); font-size: var(--font-size-xxsmall); font-weight: 600; cursor: pointer; }
.work-btn:hover { border-color: var(--fleet-black-25); color: var(--fleet-black); }
.work-btn:disabled { opacity: 0.5; cursor: default; }
.work-btn--on { background: var(--fleet-black-5); color: var(--fleet-black); }
.flag-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.flag-chip { display: inline-flex; align-items: center; gap: 8px; padding: 5px 10px; border-radius: var(--radius-full); border: 1px solid var(--fleet-black-10); background: var(--fleet-white); font: inherit; font-size: var(--font-size-sm); color: var(--fleet-black-75); cursor: pointer; transition: background var(--transition-fast), border-color var(--transition-fast); }
.flag-chip:hover { border-color: var(--fleet-black-25); }
.flag-chip--critical { border-left: 3px solid var(--status-critical); }
.flag-chip--elevated { border-left: 3px solid var(--status-elevated); }
.flag-chip--fair { border-left: 3px solid var(--status-fair); }
.flag-chip--dim { opacity: 0.55; }
.flag-chip--on { background: var(--fleet-black); color: var(--fleet-white); border-color: var(--fleet-black); }
.flag-chip-count { font-family: var(--font-mono); font-weight: 700; }
.flag-active { display: flex; align-items: flex-start; gap: var(--pad-small); margin: 0; font-size: var(--font-size-sm); color: var(--fleet-black-75); line-height: 1.5; text-wrap: pretty; }
.flag-caveat-inline { color: var(--status-fair-text); }
.risk-formula { color: var(--fleet-black-50); }

/* ─── Governance tiers ─── */
.tier-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--pad-smedium); }
.tier-card {
  display: flex; flex-direction: column; gap: var(--pad-smedium);
  background: var(--fleet-white); border: 1px solid var(--fleet-black-10);
  border-top: 3px solid var(--fleet-black-25); border-radius: var(--radius-large);
  padding: var(--pad-medium);
}
.tier-card--known { border-top-color: var(--status-good-soft); }
.tier-card--explorative { border-top-color: var(--status-fair); }
.tier-card--local { border-top-color: var(--fleet-vibrant-blue); }
.tier-head { display: flex; flex-direction: column; gap: 2px; }
.tier-eyebrow { font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black-50); letter-spacing: 0.4px; text-transform: uppercase; }
.tier-count { font-size: 34px; font-weight: 700; line-height: 1; color: var(--fleet-black); font-variant-numeric: tabular-nums; }
.tier-sub { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.tier-note { margin: 0; font-size: var(--font-size-sm); color: var(--fleet-black-50); line-height: 1.45; text-wrap: pretty; }
.tier-mcp { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--fleet-black-5); padding-top: var(--pad-small); }
.tier-mcp-row { display: flex; justify-content: space-between; font-size: var(--font-size-sm); color: var(--fleet-black-75); }
.tier-mcp-row strong { font-family: var(--font-mono); color: var(--fleet-black); }
@media (max-width: 1100px) { .tier-grid { grid-template-columns: 1fr; } }
.hero-support { margin: 0; font-size: var(--font-size-base); line-height: 1.6; color: var(--fleet-black-33); text-wrap: pretty; }
.hero-rail { display: flex; flex-direction: column; gap: 10px; }
.hero-rail-list { display: flex; flex-direction: column; gap: 8px; }
.hero-rail-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.06); border-radius: var(--radius-medium); font-size: var(--font-size-base); }
.hero-rail-row--bad { background: rgba(235, 67, 67, 0.16); }
.hero-rail-row--warn { background: rgba(255, 159, 28, 0.14); }
.hero-rail-count { font-family: var(--font-mono); font-weight: 700; }

.grammar-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--pad-medium); flex-wrap: wrap; }
.grammar-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.grammar-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); }

/* ─── Flag list ─── */
.flag-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  overflow: hidden;
  background: var(--fleet-white);
}
.flag-row {
  display: grid;
  grid-template-columns: 96px 1fr 220px;
  gap: var(--pad-medium);
  align-items: center;
  padding: var(--pad-smedium) var(--pad-medium);
  border: 0;
  border-bottom: 1px solid var(--fleet-black-10);
  background: transparent;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: background var(--transition-fast);
}
.flag-row:last-child { border-bottom: 0; }
.flag-row:hover { background: var(--fleet-black-3); }
.flag-row--open { background: var(--fleet-black-5); }
.flag-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.flag-label { font-size: var(--font-size-base); font-weight: 600; color: var(--fleet-black); }
.flag-uncat { font-weight: 400; color: var(--fleet-black-50); }
.flag-desc { font-size: var(--font-size-sm); color: var(--fleet-black-50); line-height: 1.45; text-wrap: pretty; }
.flag-caveat { margin-top: 4px; font-size: var(--font-size-sm); color: var(--status-fair-text); line-height: 1.45; text-wrap: pretty; }
.flag-counts { display: flex; flex-direction: column; gap: 2px; font-size: var(--font-size-sm); color: var(--fleet-black-75); text-align: right; }
.flag-count strong { font-family: var(--font-mono); color: var(--fleet-black); }
.flag-surfaces { color: var(--fleet-black-50); }

.drill-fleet-link { font-size: var(--font-size-sm); }

/* ─── Listeners ─── */
.listener-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.listener-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: var(--pad-medium);
  align-items: baseline;
  font-size: var(--font-size-sm);
  padding: 6px 0;
  border-bottom: 1px solid var(--fleet-black-5);
}
.listener-row:last-child { border-bottom: 0; }
.listener-tool { font-weight: 600; color: var(--fleet-black); }
.listener-addr { font-family: var(--font-mono); color: var(--fleet-black-75); }
.listener-cat, .listener-host { color: var(--fleet-black-50); }

/* ─── Expert findings ─── */
.findings-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pad-medium);
  flex-wrap: wrap;
}

@media (max-width: 1100px) {
  .ai-hero { grid-template-columns: 1fr; gap: 20px; }
  .hero-narrative { border-left: none; padding-left: 0; }
  .flag-row { grid-template-columns: 96px 1fr; }
  .flag-counts { grid-column: 2; flex-direction: row; gap: var(--pad-medium); text-align: left; }
}
</style>
