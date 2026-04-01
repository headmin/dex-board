import { createRouter, createWebHistory } from 'vue-router'
import ExperienceScore from './views/ExperienceScore.vue'
import Dashboard from './views/Dashboard.vue'
import DexOverview from './views/DexOverview.vue'
import DexQueryPack from './views/DexQueryPack.vue'
import AuditLogs from './views/AuditLogs.vue'
import GitOpsTimeline from './views/GitOpsTimeline.vue'
import Firehose from './views/Firehose.vue'

const routes = [
  { path: '/', name: 'Experience', component: ExperienceScore },
  { path: '/devices', name: 'Devices', component: Dashboard },
  { path: '/timeline', name: 'Timeline', component: GitOpsTimeline },
  { path: '/overview', name: 'Overview', component: DexOverview },
  { path: '/reports', name: 'Reports', component: DexQueryPack },
  { path: '/audit', name: 'Audit', component: AuditLogs },
  { path: '/firehose', name: 'Firehose', component: Firehose }
]

export default createRouter({
  history: createWebHistory(),
  routes
})
