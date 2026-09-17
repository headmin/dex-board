<template>
  <section class="grammar-section ai-vis">
    <div class="grammar-head">
      <h2 class="grammar-title">AI — tools and agents on this host</h2>
      <span class="grammar-hint">
        <template v-if="scannedAt">Latest scan {{ scannedAtLabel }} · </template>
        <router-link to="/ai-tools" class="custom-link">fleet view</router-link>
      </span>
    </div>

    <SkeletonLoader v-if="loading" variant="table" :rows="4" :columns="4" height="160px" />
    <div v-else-if="error" class="error-banner">{{ error }}</div>
    <EmptyState v-else-if="!rows.length" small
      :title="scanned ? 'No AI tooling found on this host' : 'No AI scan for this host'"
      :info="scanned ? 'The latest scan came back empty.' : 'The AI discovery query has not reported for this host in the last 7 days.'" />

    <template v-else>
      <!-- ─── Governance strip ─── -->
      <div class="ai-vis-tiers">
        <div class="ai-vis-tile ai-vis-tile--known">
          <span class="ai-vis-eyebrow">Known products</span>
          <span class="ai-vis-count">{{ gov.known.tools }}</span>
          <span class="ai-vis-list">{{ names(gov.known.list) }}</span>
        </div>
        <div class="ai-vis-tile ai-vis-tile--explorative">
          <span class="ai-vis-eyebrow">Explorative tools</span>
          <span class="ai-vis-count">{{ gov.explorative.tools }}</span>
          <span class="ai-vis-list">{{ names(gov.explorative.list) || '—' }}</span>
        </div>
        <div class="ai-vis-tile ai-vis-tile--local">
          <span class="ai-vis-eyebrow">Local &amp; MCP</span>
          <span class="ai-vis-count">{{ gov.local.tools + gov.mcp.servers }}</span>
          <span class="ai-vis-list">{{ [names(gov.local.list), gov.mcp.servers ? `${gov.mcp.servers} MCP server${gov.mcp.servers === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || '—' }}</span>
        </div>
        <div class="ai-vis-tile" :class="summary.risk.flagged ? 'ai-vis-tile--' + worstSeverity : 'ai-vis-tile--clean'">
          <span class="ai-vis-eyebrow">Flagged findings</span>
          <span class="ai-vis-count">{{ summary.risk.flagged }}</span>
          <span class="ai-vis-list">{{ summary.risk.flagged ? flagSummary : 'no risk flags' }}</span>
        </div>
      </div>

      <!-- ─── Flags, worst first ─── -->
      <div v-if="summary.risk.flags.length" class="ai-vis-flags">
        <div v-for="f in summary.risk.flags" :key="f.flag" class="ai-vis-flag">
          <Badge :tone="SEVERITY_TONE[f.severity]" :label="f.severity" />
          <div class="ai-vis-flag-text">
            <span class="ai-vis-flag-label">{{ f.label }} <span class="ai-vis-flag-count">· {{ f.findings }} finding{{ f.findings === 1 ? '' : 's' }}</span></span>
            <span class="ai-vis-flag-desc">{{ f.description }}</span>
          </div>
        </div>
      </div>

      <!-- ─── MCP servers on this host ─── -->
      <div v-if="servers.length" class="ai-vis-block">
        <h3 class="card-title">MCP servers <span class="ai-vis-muted">· {{ servers.length }}</span></h3>
        <DataTable :data="serverRows" :columns="serverColumns" density="compact" defaultSortKey="severity_rank" />
      </div>

      <!-- ─── Everything found ─── -->
      <div class="ai-vis-block">
        <div class="ai-vis-block-head">
          <h3 class="card-title">All findings <span class="ai-vis-muted">· {{ rows.length }}</span></h3>
          <Tabs v-model="typeFilter" :options="typeOptions" variant="underline" />
        </div>
        <DataTable :data="findingRows" :columns="findingColumns" density="compact" defaultSortKey="severity_rank" :maxRows="60" />
        <p v-if="findingRows.length > 60" class="ai-vis-muted">Showing the first 60 of {{ findingRows.length }} findings.</p>
      </div>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import dayjs from 'dayjs'
import { query } from '../../services/api'
import Badge from '../base/Badge.vue'
import EmptyState from '../base/EmptyState.vue'
import SkeletonLoader from '../base/SkeletonLoader.vue'
import Tabs from '../base/Tabs.vue'
import DataTable from '../DataTable.vue'
import { normalizeRows, summarize, mcpServers, governance, flagInfo, isLoopback, SURFACES, SEVERITY_TONE } from '../../composables/aiInventory'
import { useAppConfig } from '../../composables/useAppConfig'
import { isMasked } from '../../composables/useDemoMode'

/**
 * Per-host AI visibility — the host-detail slice of the /ai-tools page.
 * Same normaliser, same tiers, same flag catalogue; scoped to one host via
 * the registry's hostId filter so the numbers agree with the fleet view.
 */
const props = defineProps({
  hostId: { type: String, required: true },
})

const { config } = useAppConfig()
const rows = ref([])
const scanned = ref(false)
const scannedAt = ref(null)
const loading = ref(false)
const error = ref(null)
const typeFilter = ref('')

const SEVERITY_RANK = { critical: 0, elevated: 1, fair: 2 }
const rankOf = s => (s ? SEVERITY_RANK[s] : 9)
const severityTone = s => (s ? SEVERITY_TONE[s] : null)

async function load() {
  if (!props.hostId) return
  loading.value = true
  error.value = null
  try {
    const [inv, cov] = await Promise.all([
      query('firehose.ai.inventory', { hostId: props.hostId }),
      query('firehose.ai.coverage', { hostId: props.hostId }).catch(() => []),
    ])
    rows.value = normalizeRows(inv)
    const c = cov?.[0]
    scanned.value = Number(c?.hosts_scanned) > 0
    scannedAt.value = c?.latest_scan || rows.value[0]?.scannedAt || null
  } catch (e) {
    // An unregistered query (older Worker) reads as "no scan", not as a page error.
    if (/not found in registry|status 404/i.test(String(e?.message))) { rows.value = []; scanned.value = false }
    else error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => props.hostId, load)

const summary = computed(() => summarize(rows.value))
const gov = computed(() => governance(rows.value, config.value.knownAiVendors ? { knownVendors: config.value.knownAiVendors } : {}))
const servers = computed(() => mcpServers(rows.value))
const worstSeverity = computed(() => summary.value.risk.flags[0]?.severity || null)
const flagSummary = computed(() => summary.value.risk.flags.slice(0, 3).map(f => f.label.toLowerCase()).join(', '))
const scannedAtLabel = computed(() => (scannedAt.value ? dayjs(scannedAt.value).format('YYYY-MM-DD HH:mm') : ''))

const names = list => list.slice(0, 4).map(t => t.key).join(', ') + (list.length > 4 ? ` +${list.length - 4}` : '')
const flagLabels = flags => (flags || []).slice()
  .sort((a, b) => rankOf(flagInfo(a).severity) - rankOf(flagInfo(b).severity))
  .map(f => flagInfo(f).label).join(', ')
const maskPath = p => {
  if (!p) return ''
  if (!isMasked('hosts')) return p
  return String(p).replace(/\/Users\/[^/]+/, '/Users/•••').replace(/\\Users\\[^\\]+/, '\\Users\\•••')
}

const serverColumns = [
  { key: 'name', label: 'Server' },
  { key: 'severity_label', label: 'Severity', tone: (v, r) => severityTone(r.severity) },
  { key: 'clients_label', label: 'Clients' },
  { key: 'transport_label', label: 'Transport' },
  { key: 'endpoint_label', label: 'Endpoint' },
  { key: 'running_label', label: 'Process seen' },
  { key: 'flags_label', label: 'Flags' },
]
const serverRows = computed(() => servers.value.map(s => ({
  ...s,
  severity_rank: rankOf(s.severity),
  severity_label: s.severity || 'none',
  clients_label: s.clients.join(', ') || (s.discovery.includes('process') ? 'process only' : '—'),
  transport_label: s.transports.join(', ') || '—',
  endpoint_label: s.endpointHosts.length ? s.endpointHosts.map(h => (isLoopback(h) ? `${h} (loopback)` : h)).join(', ')
    : s.transports.includes('stdio') ? 'local process' : '—',
  running_label: s.running ? 'yes' : 'config only',
  flags_label: (flagLabels(s.flags) || '—') + (s.waivedFlags.length ? ` (waived: ${flagLabels(s.waivedFlags)})` : ''),
})))

const findingColumns = [
  { key: 'surface', label: 'Surface' },
  { key: 'tool', label: 'Tool' },
  { key: 'name', label: 'Name' },
  { key: 'tier_label', label: 'Tier' },
  { key: 'severity_label', label: 'Severity', tone: (v, r) => severityTone(r.severity) },
  { key: 'flags_label', label: 'Flags' },
  { key: 'source', label: 'Source' },
  { key: 'version', label: 'Version' },
  { key: 'path_label', label: 'Path' },
]
const typeOptions = computed(() => [
  { value: '', label: 'All', count: rows.value.length },
  ...SURFACES.filter(s => rows.value.some(r => r.type === s.type))
    .map(s => ({ value: s.type, label: s.short, count: rows.value.filter(r => r.type === s.type).length })),
])
const findingRows = computed(() => rows.value
  .filter(r => !typeFilter.value || r.type === typeFilter.value)
  .map(r => ({
    ...r,
    severity_rank: rankOf(r.severity),
    severity_label: r.severity || 'none',
    tier_label: r.tier || '—',
    flags_label: (flagLabels(r.flags) || '—') + (r.waivedFlags.length ? ` (waived: ${flagLabels(r.waivedFlags)})` : ''),
    path_label: maskPath(r.path) || '—',
  })))
</script>

<style scoped>
.grammar-section { display: flex; flex-direction: column; gap: var(--pad-smedium); }
.grammar-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--pad-medium); }
.grammar-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.grammar-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.card-title { margin: 0; font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.ai-vis-muted { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-weight: 400; margin: 0; }

.ai-vis-tiers { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--pad-smedium); }
.ai-vis-tile {
  display: flex; flex-direction: column; gap: 4px;
  background: var(--fleet-white); border: 1px solid var(--fleet-black-10);
  border-top: 3px solid var(--fleet-black-25); border-radius: var(--radius-large);
  padding: var(--pad-smedium) var(--pad-medium);
}
.ai-vis-tile--known { border-top-color: var(--status-good-soft); }
.ai-vis-tile--explorative { border-top-color: var(--status-fair); }
.ai-vis-tile--local { border-top-color: var(--fleet-vibrant-blue); }
.ai-vis-tile--clean { border-top-color: var(--status-good); }
.ai-vis-tile--fair { border-top-color: var(--status-fair); }
.ai-vis-tile--elevated { border-top-color: var(--status-elevated); }
.ai-vis-tile--critical { border-top-color: var(--status-critical); }
.ai-vis-eyebrow { font-size: var(--font-size-xxsmall); font-weight: 600; color: var(--fleet-black-50); letter-spacing: 0.4px; text-transform: uppercase; }
.ai-vis-count { font-size: 26px; font-weight: 700; line-height: 1; color: var(--fleet-black); font-variant-numeric: tabular-nums; }
.ai-vis-list { font-size: var(--font-size-sm); color: var(--fleet-black-75); line-height: 1.4; text-wrap: pretty; }

.ai-vis-flags { display: flex; flex-direction: column; border: 1px solid var(--fleet-black-10); border-radius: var(--radius-large); background: var(--fleet-white); overflow: hidden; }
.ai-vis-flag { display: grid; grid-template-columns: 96px 1fr; gap: var(--pad-medium); align-items: center; padding: var(--pad-small) var(--pad-medium); border-bottom: 1px solid var(--fleet-black-10); }
.ai-vis-flag:last-child { border-bottom: 0; }
.ai-vis-flag-text { display: flex; flex-direction: column; gap: 2px; }
.ai-vis-flag-label { font-size: var(--font-size-base); font-weight: 600; color: var(--fleet-black); }
.ai-vis-flag-count { font-weight: 400; color: var(--fleet-black-50); }
.ai-vis-flag-desc { font-size: var(--font-size-sm); color: var(--fleet-black-50); line-height: 1.45; text-wrap: pretty; }

.ai-vis-block { display: flex; flex-direction: column; gap: var(--pad-small); }
.ai-vis-block-head { display: flex; align-items: center; justify-content: space-between; gap: var(--pad-medium); flex-wrap: wrap; }

@media (max-width: 1100px) { .ai-vis-tiers { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .ai-vis-tiers { grid-template-columns: 1fr; } }
</style>
