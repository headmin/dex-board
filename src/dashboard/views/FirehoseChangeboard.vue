<template>
  <div class="changeboard">
    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="loading" class="loading-state">Loading GitOps data...</div>

    <template v-if="!loading && commits.length">
      <!-- Header -->
      <header class="cb-header">
        <PageHeader
          title="GitOps changeboard"
          :subtitle="`${commits.length} commits · ${platformList.join(', ')}`"
        />
      </header>

      <!-- Main 3-column layout -->
      <div class="cb-main">
        <!-- Left: File tree -->
        <div class="tree-panel">
          <div class="panel-head">
            <SectionHeader title="Structure" />
          </div>
          <div class="tree-root">
            <div v-if="structure.global_config" class="tree-leaf" :class="{ highlight: isFileChanged('it-and-security/default.yml') }">
              <svg class="tree-file-icon" viewBox="0 0 16 16" fill="none"><path d="M3.5 1.5h6l3 3v10h-9v-13z" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 1.5v3h3" stroke="currentColor" stroke-width="1.5"/></svg>
              <span class="tree-label">default.yml</span>
            </div>

            <div v-if="structure.fleets?.length" class="tree-folder">
              <div class="tree-node" @click="toggleFolder('fleets')">
                <svg class="tree-chevron" :class="{ open: openFolders.fleets }" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>
                <svg class="tree-folder-icon" viewBox="0 0 16 16" fill="none"><path d="M2 4h5l1 2h6v8H2V4z" stroke="currentColor" stroke-width="1.5"/></svg>
                <span class="tree-label">fleets</span>
                <Badge class="tree-count" tone="neutral" :label="String(structure.fleets.length)" />
              </div>
              <div class="tree-children" v-show="openFolders.fleets">
                <div v-for="f in structure.fleets" :key="f.name" class="tree-leaf" :class="{ highlight: isFileChanged(f.file) }">
                  <svg class="tree-file-icon" viewBox="0 0 16 16" fill="none"><path d="M3.5 1.5h6l3 3v10h-9v-13z" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 1.5v3h3" stroke="currentColor" stroke-width="1.5"/></svg>
                  <span class="tree-label">{{ f.name }}.yml</span>
                </div>
              </div>
            </div>

            <div v-for="(resources, platform) in structure.platforms || {}" :key="platform" class="tree-folder">
              <div class="tree-node" @click="toggleFolder(platform)">
                <svg class="tree-chevron" :class="{ open: openFolders[platform] }" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>
                <span class="platform-icon">{{ platformIcon(platform) }}</span>
                <span class="tree-label">{{ platform }}</span>
                <Badge class="tree-count" tone="neutral" :label="String(platformItemCount(resources))" />
              </div>
              <div class="tree-children" v-show="openFolders[platform]">
                <div v-for="(items, rtype) in resources" :key="rtype" class="tree-folder sub">
                  <div class="tree-node" @click.stop="toggleFolder(platform + '_' + rtype)">
                    <svg class="tree-chevron" :class="{ open: openFolders[platform + '_' + rtype] }" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>
                    <svg class="tree-folder-icon" viewBox="0 0 16 16" fill="none"><path d="M2 4h5l1 2h6v8H2V4z" stroke="currentColor" stroke-width="1.5"/></svg>
                    <span class="tree-label">{{ rtype.replace(/_/g, '-') }}</span>
                    <Badge class="tree-count" tone="neutral" :label="String(items.length)" />
                  </div>
                  <div class="tree-children" v-show="openFolders[platform + '_' + rtype]">
                    <div v-for="item in items" :key="item.name" class="tree-leaf" :class="{ highlight: isFileChanged(item.file) }">
                      <svg class="tree-file-icon" viewBox="0 0 16 16" fill="none"><path d="M3.5 1.5h6l3 3v10h-9v-13z" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 1.5v3h3" stroke="currentColor" stroke-width="1.5"/></svg>
                      <span class="tree-label">{{ item.name }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Center: Diagram -->
        <div class="diagram-panel">
          <SectionHeader title="Architecture" />
          <div class="diagram-zoom-controls">
            <BaseButton size="small" variant="secondary" title="Zoom in" @click="zoomIn">+</BaseButton>
            <BaseButton size="small" variant="secondary" title="Reset" @click="zoomReset">1:1</BaseButton>
            <BaseButton size="small" variant="secondary" title="Zoom out" @click="zoomOut">&minus;</BaseButton>
          </div>
          <div class="diagram-container" ref="diagramRef" @wheel="onWheel" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" :class="{ panning: isPanning }">
            <div class="diagram-inner" :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel})`, transformOrigin: 'top center' }" v-html="diagramSvg"></div>
          </div>
        </div>

        <!-- Right: Detail -->
        <div class="detail-panel">
          <SectionHeader title="Summary" />
          <div class="stats-grid" v-if="structure.summary">
            <MetricCard v-for="s in summaryStats" :key="s.label" :label="s.label" :value="s.value" />
          </div>

          <SectionHeader title="Selected commit" />
          <div v-if="currentCommit" class="commit-card">
            <div class="commit-msg">{{ currentCommit.message }}</div>
            <div class="commit-meta-row">
              <span>{{ currentCommit.author }}</span>
              <a :href="currentCommit.commit_url" target="_blank">{{ currentCommit.short_sha }}</a>
              <Badge :tone="changeTypeTone(currentCommit.change_type)" :label="sentenceCase(currentCommit.change_type)" />
              <Badge tone="neutral" :label="sentenceCase(currentCommit.scope)" />
            </div>
            <div class="commit-cats" v-if="currentCommit.categories">
              <Chip
                v-for="(items, cat) in nonEmpty(currentCommit.categories)"
                :key="cat"
                tone="neutral"
                :label="sentenceCase(cat)"
                :value="String(items.length)"
              />
            </div>
          </div>
          <div v-else class="placeholder">Move the slider to select a commit</div>

          <SectionHeader title="Changed files" />
          <ul class="file-list" v-if="currentCommit">
            <li v-for="f in currentCommit.files" :key="f">
              <svg class="file-icon" viewBox="0 0 16 16" fill="none"><path d="M3.5 1.5h6l3 3v10h-9v-13z" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 1.5v3h3" stroke="currentColor" stroke-width="1.5"/></svg>
              <span class="file-name">{{ f.replace('it-and-security/', '') }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Timeline slider -->
      <div class="timeline-bar">
        <span class="tl-label">Timeline</span>
        <div class="tl-controls">
          <IconButton size="small" variant="secondary" label="Previous commit" @click="prevCommit">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M7.5 2L3.5 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </IconButton>
          <IconButton size="small" variant="secondary" :label="playing ? 'Pause' : 'Play'" @click="togglePlay">
            <svg v-if="playing" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2.5" y="2" width="2.5" height="8" rx="0.5"/><rect x="7" y="2" width="2.5" height="8" rx="0.5"/></svg>
            <svg v-else width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3.5 2.2v7.6a.5.5 0 0 0 .76.43l6.1-3.8a.5.5 0 0 0 0-.86l-6.1-3.8a.5.5 0 0 0-.76.43z"/></svg>
          </IconButton>
          <IconButton size="small" variant="secondary" label="Next commit" @click="nextCommit">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4.5 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </IconButton>
        </div>
        <input type="range" v-model.number="sliderIndex" :min="0" :max="Math.max(0, filteredCommits.length - 1)" :disabled="filteredCommits.length === 0" class="tl-slider" />
        <span class="tl-date">{{ currentDateStr }}</span>
        <div class="tl-search">
          <SearchInput v-model="search" placeholder="Search messages, authors, files, scope..." />
        </div>
        <span v-if="search" class="tl-search-counter">
          {{ filteredCommits.length }} / {{ commits.length }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import BaseButton from '../components/base/BaseButton.vue'
import IconButton from '../components/base/IconButton.vue'
import SearchInput from '../components/base/SearchInput.vue'
import Badge from '../components/base/Badge.vue'
import Chip from '../components/base/Chip.vue'
import MetricCard from '../components/MetricCard.vue'

const BASE_URL = 'https://raw.githubusercontent.com/headmin/fleet-gitops-changelog/refs/heads/main'

const loading = ref(true)
const error = ref(null)
const commits = ref([])
const structure = ref({})
const sliderIndex = ref(0)
const search = ref('')

// Case-insensitive substring match across message, author, scope, change_type,
// short_sha, and file paths. Empty search returns the unfiltered list.
const filteredCommits = computed(() => {
  if (!search.value) return commits.value
  const s = search.value.toLowerCase()
  return commits.value.filter(c =>
    (c.message     || '').toLowerCase().includes(s) ||
    (c.author      || '').toLowerCase().includes(s) ||
    (c.scope       || '').toLowerCase().includes(s) ||
    (c.change_type || '').toLowerCase().includes(s) ||
    (c.short_sha   || '').toLowerCase().includes(s) ||
    (c.files       || []).some(f => f.toLowerCase().includes(s)) ||
    Object.keys(c.categories || {}).some(k => k.toLowerCase().includes(s))
  )
})

// Reset slider to start of filtered set whenever the filter changes.
watch(search, () => { sliderIndex.value = 0 })
const openFolders = ref({})
const diagramSvg = ref('')
const diagramRef = ref(null)
const playing = ref(false)
const zoomLevel = ref(1.4)
const panX = ref(0)
const panY = ref(0)
const isPanning = ref(false)
let panStart = { x: 0, y: 0, px: 0, py: 0 }
let playTimer = null
let mermaidInstance = null

const currentCommit = computed(() => filteredCommits.value[sliderIndex.value])

const currentDateStr = computed(() => {
  const c = currentCommit.value
  if (!c) return '\u2014'
  const d = new Date(c.timestamp)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' \u00B7 ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
})

const platformList = computed(() => structure.value.summary?.platforms || [])

const summaryStats = computed(() => {
  const s = structure.value.summary
  if (!s) return []
  return [
    { label: 'Fleets', value: s.fleets },
    { label: 'Policies', value: s.policies },
    { label: 'Profiles', value: s.configuration_profiles },
    { label: 'Scripts', value: s.scripts },
    { label: 'Software', value: s.software },
    { label: 'Reports', value: s.reports },
  ]
})

const changedFilesSet = computed(() => new Set(currentCommit.value?.files || []))

function isFileChanged(path) { return changedFilesSet.value.has(path) }
function toggleFolder(key) { openFolders.value[key] = !openFolders.value[key] }

// change_type value → Badge tone (was .badge-<type> tint classes).
const CHANGE_TYPE_TONES = {
  policy: 'info',
  security: 'critical',
  software: 'fair',
  script: 'good',
  config: 'neutral',
  profile: 'elevated',
  report: 'info',
  other: 'neutral',
}
function changeTypeTone(t) { return CHANGE_TYPE_TONES[t] || 'neutral' }
function sentenceCase(s) {
  const str = String(s || '').replace(/_/g, ' ')
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function springOpenChanged() {
  // Close all folders first
  const newState = {}
  const files = currentCommit.value?.files || []

  for (const f of files) {
    const parts = f.split('/')
    // it-and-security/fleets/xxx.yml → open 'fleets'
    if (parts[1] === 'fleets') {
      newState['fleets'] = true
    }
    // it-and-security/lib/<platform>/<type>/xxx → open platform + platform_type
    if (parts[1] === 'lib' && parts.length >= 4) {
      const platform = parts[2]
      const rtype = parts[3]
      newState[platform] = true
      // Map folder names to structure keys (configuration-profiles → configuration_profiles)
      const rtypeKey = rtype.replace(/-/g, '_')
      newState[platform + '_' + rtypeKey] = true
    }
  }

  openFolders.value = newState
}
function platformIcon(p) { return ({ all: '\uD83C\uDF10', macos: '\uD83C\uDF4E', windows: '\uD83E\uDEDF', linux: '\uD83D\uDC27', ios: '\uD83D\uDCF1', ipados: '\uD83D\uDCF1', android: '\uD83E\uDD16' })[p] || '\uD83D\uDCC2' }
function platformItemCount(resources) { return Object.values(resources).reduce((s, arr) => s + arr.length, 0) }
function nonEmpty(cats) { const r = {}; for (const [k, v] of Object.entries(cats)) { if (v?.length) r[k] = v }; return r }
function sanitize(s) { return s.replace(/[^a-zA-Z0-9]/g, '_') }

function zoomIn() { zoomLevel.value = Math.min(3, zoomLevel.value + 0.15) }
function zoomOut() { zoomLevel.value = Math.max(0.3, zoomLevel.value - 0.15) }
function zoomReset() { zoomLevel.value = 1.4; panX.value = 0; panY.value = 0 }
function onWheel(e) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (e.deltaY < 0) zoomIn(); else zoomOut() } }
function onPointerDown(e) { isPanning.value = true; panStart = { x: e.clientX, y: e.clientY, px: panX.value, py: panY.value }; e.currentTarget.setPointerCapture(e.pointerId) }
function onPointerMove(e) { if (!isPanning.value) return; panX.value = panStart.px + (e.clientX - panStart.x); panY.value = panStart.py + (e.clientY - panStart.y) }
function onPointerUp() { isPanning.value = false }

function prevCommit() { sliderIndex.value = Math.max(0, sliderIndex.value - 1) }
function nextCommit() { sliderIndex.value = Math.min(filteredCommits.value.length - 1, sliderIndex.value + 1) }

function togglePlay() {
  if (playing.value) { clearInterval(playTimer); playTimer = null; playing.value = false }
  else {
    playing.value = true
    playTimer = setInterval(() => {
      if (sliderIndex.value >= filteredCommits.value.length - 1) sliderIndex.value = 0
      else sliderIndex.value++
    }, 1500)
  }
}

async function renderDiagram() {
  if (!structure.value.platforms) return
  const changed = changedFilesSet.value

  let def = 'graph LR\n'
  def += '  classDef default fill:#f9fafc,stroke:#e2e4ea,color:#192147\n'
  // Mermaid classDef needs literal hex — CSS var() is not valid in its
  // style directives. These mirror the canonical --status-good tokens.
  def += '  classDef changed fill:#deedea,stroke:#009a7d,color:#00775f,stroke-width:2px\n'
  def += '  classDef fleet fill:#f0efff,stroke:#6a67fe,color:#4b4ab4\n'
  def += '  classDef platform fill:#f3e8ff,stroke:#ae6ddf,color:#6b21a8\n\n'
  def += '  ROOT["it-and-security"]:::default\n'

  const gcChanged = changed.has('it-and-security/default.yml')
  def += `  GC["default.yml"]${gcChanged ? ':::changed' : ':::default'}\n`
  def += '  ROOT --> GC\n'

  def += '  FLEETS["fleets/"]:::fleet\n'
  def += '  ROOT --> FLEETS\n'
  for (const f of (structure.value.fleets || [])) {
    const id = `FL_${sanitize(f.name)}`
    def += `  ${id}["${f.name}"]${changed.has(f.file) ? ':::changed' : ':::default'}\n`
    def += `  FLEETS --> ${id}\n`
  }

  for (const [platform, resources] of Object.entries(structure.value.platforms || {})) {
    const pid = `P_${sanitize(platform)}`
    def += `  ${pid}["${platform}"]:::platform\n`
    def += `  ROOT --> ${pid}\n`
    for (const [rtype, items] of Object.entries(resources)) {
      const rid = `${pid}_${sanitize(rtype)}`
      const anyChanged = items.some(i => changed.has(i.file))
      def += `  ${rid}["${rtype.replace(/_/g, '-')} (${items.length})"]${anyChanged ? ':::changed' : ':::default'}\n`
      def += `  ${pid} --> ${rid}\n`
    }
  }

  try {
    if (!mermaidInstance) {
      const mod = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')
      mermaidInstance = mod.default
      mermaidInstance.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { curve: 'basis', padding: 16 } })
    }
    // Unique counter id + generation guard: two same-tick renders with a
    // Date.now() id collide inside mermaid and both return EMPTY SVGs
    // (the always-blank-diagram bug).
    const gen = ++renderGen
    const { svg } = await mermaidInstance.render('mermaid-' + gen, def)
    if (gen === renderGen) diagramSvg.value = svg
  } catch (e) {
    diagramSvg.value = `<div style="padding:20px;color:var(--fleet-black-50)">Diagram error: ${e.message}</div>`
  }
}

let renderGen = 0

watch(sliderIndex, () => {
  springOpenChanged()
  renderDiagram()
})

async function fetchData() {
  loading.value = true; error.value = null
  try {
    const [jsonlRes, structRes] = await Promise.all([
      fetch(`${BASE_URL}/changelog.jsonl`),
      fetch(`${BASE_URL}/gitops-structure.json`),
    ])
    if (jsonlRes.ok) {
      const text = await jsonlRes.text()
      commits.value = text.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    }
    if (structRes.ok) structure.value = await structRes.json()
    // Setting sliderIndex triggers the watcher's renderDiagram(); a second
    // explicit call here raced it (see render guard above). Only render
    // directly when the index didn't change (watcher won't fire).
    const last = commits.value.length - 1
    const willWatch = sliderIndex.value !== last
    sliderIndex.value = last
    await nextTick()
    if (!willWatch) renderDiagram()
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

onMounted(() => fetchData())
onUnmounted(() => { if (playTimer) clearInterval(playTimer) })
</script>

<style scoped>
.changeboard { display: flex; flex-direction: column; height: calc(100vh - 120px); background: var(--fleet-off-white); overflow: hidden; }
.changeboard > .error-banner { margin: 16px; }
.loading-state { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--fleet-black-50); }
.placeholder { color: var(--fleet-black-50); font-size: var(--font-size-sm); padding: 12px; }

.cb-header { padding: 16px 20px; border-bottom: 1px solid var(--fleet-black-10); background: var(--fleet-white); flex-shrink: 0; }

.cb-main { display: grid; grid-template-columns: 280px 1fr 320px; flex: 1; overflow: hidden; }

/* Tree */
.tree-panel { border-right: 1px solid var(--fleet-black-10); overflow-y: auto; padding: 12px 0; background: var(--fleet-white); }
.panel-head { padding: 0 16px 8px; }
.tree-node { padding: 6px 16px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: var(--font-size-sm); transition: background var(--transition-fast); }
.tree-node:hover { background: var(--fleet-black-3); }
.tree-leaf { padding: 5px 16px 5px 28px; font-size: 12px; color: var(--fleet-black-75); transition: background var(--transition-fast); display: flex; align-items: center; gap: 6px; }
.tree-leaf.highlight { background: var(--status-good-bg); color: var(--status-good); font-weight: 600; }
.tree-folder.sub .tree-node { padding-left: 28px; }
.tree-folder.sub .tree-leaf { padding-left: 44px; }
.tree-chevron { width: 14px; height: 14px; color: var(--fleet-black-33); transition: transform var(--transition-fast); flex-shrink: 0; }
.tree-chevron.open { transform: rotate(90deg); }
.tree-folder-icon { width: 14px; height: 14px; color: var(--fleet-black-50); flex-shrink: 0; }
.tree-file-icon { width: 14px; height: 14px; color: var(--fleet-black-33); flex-shrink: 0; }
.tree-leaf.highlight .tree-file-icon { color: var(--status-good); }
.platform-icon { font-size: 14px; line-height: 1; }
.tree-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-body); font-size: 13px; }
.tree-count { margin-left: auto; }

/* Diagram */
.diagram-panel { overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: var(--fleet-black-3); }
.diagram-zoom-controls { display: flex; gap: 4px; }
.diagram-container { flex: 1; overflow: hidden; background: var(--fleet-white); border-radius: var(--radius-large); border: 1px solid var(--fleet-black-10); padding: 16px; cursor: grab; user-select: none; }
.diagram-container.panning { cursor: grabbing; }
.diagram-inner { transition: transform 100ms ease; display: inline-block; pointer-events: none; }
.diagram-inner :deep(svg) { max-width: none; height: auto; }

/* Detail */
.detail-panel { border-left: 1px solid var(--fleet-black-10); overflow-y: auto; padding: 16px; background: var(--fleet-white); display: flex; flex-direction: column; gap: 16px; }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.commit-card { background: var(--fleet-black-3); border: 1px solid var(--fleet-black-10); border-radius: var(--radius-large); padding: 14px; }
.commit-msg { font-family: var(--font-body); font-size: var(--font-size-sm); font-weight: 600; line-height: 1.5; margin-bottom: 10px; color: var(--fleet-black); }
.commit-meta-row { font-family: var(--font-body); font-size: var(--font-size-xs); color: var(--fleet-black-50); display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.commit-meta-row a { color: var(--link-color); text-decoration: none; font-family: var(--font-mono); }
.commit-meta-row a:hover { color: var(--link-color-hover); text-decoration: underline; }
.commit-cats { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.file-list { list-style: none; margin: 0; padding: 0; }
.file-list li { padding: 6px 10px; border-radius: var(--radius); display: flex; align-items: flex-start; gap: 8px; transition: background var(--transition-fast); }
.file-list li:hover { background: var(--fleet-black-3); }
.file-list .file-icon { width: 14px; height: 14px; color: var(--status-good); flex-shrink: 0; margin-top: 1px; }
.file-list .file-name { font-size: 12px; color: var(--fleet-black-75); word-break: break-all; line-height: 1.4; }

/* Timeline bar */
.timeline-bar { border-top: 1px solid var(--fleet-black-10); padding: 14px 20px; display: flex; align-items: center; gap: 14px; background: var(--fleet-white); flex-shrink: 0; }
.tl-label { font-family: var(--font-body); font-size: 13px; color: var(--fleet-black-75); font-weight: 600; }
.tl-controls { display: flex; gap: 4px; }
.tl-slider { flex: 1; accent-color: var(--fleet-green); cursor: pointer; height: 6px; }
.tl-date { font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--fleet-black); min-width: 180px; text-align: right; font-weight: 500; }
.tl-search { min-width: 280px; }
.tl-search-counter { font-family: var(--font-mono); font-size: 11px; color: var(--fleet-black-50); }

@media (max-width: 1024px) { .cb-main { grid-template-columns: 1fr; } .tree-panel, .detail-panel { max-height: 300px; } }
</style>
