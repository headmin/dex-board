import { createRouter, createWebHistory } from 'vue-router'
import ExperienceScore from './views/ExperienceScore.vue'
import Analytics from './views/Analytics.vue'
import Hosts from './views/Hosts.vue'
import HostDetail from './views/HostDetail.vue'
import Insights from './views/Insights.vue'
import GitOps from './views/GitOps.vue'
import AuditLogs from './views/AuditLogs.vue'
import StyleGuide from './views/StyleGuide.vue'
import Lifecycle from './views/Lifecycle.vue'
import SoftwareUsage from './views/SoftwareUsage.vue'
import Connectivity from './views/Connectivity.vue'
import PatchVelocity from './views/PatchVelocity.vue'

// Nav order tells the decision-maker story:
// score → why → which hosts → what to do → cost → operations → governance.
const routes = [
  { path: '/', name: 'Experience score', component: ExperienceScore },
  { path: '/analytics', name: 'Analytics', component: Analytics },
  { path: '/hosts', name: 'Hosts', component: Hosts },
  { path: '/hosts/:hostId', name: 'Host detail', component: HostDetail },
  { path: '/insights', name: 'Insights', component: Insights },
  { path: '/lifecycle', name: 'Lifecycle', component: Lifecycle },
  { path: '/software-usage', name: 'Software usage', component: SoftwareUsage },
  { path: '/software-waste', redirect: '/software-usage' },
  { path: '/gitops', name: 'GitOps timeline', component: GitOps },
  { path: '/patch-velocity', name: 'Patch velocity', component: PatchVelocity },
  { path: '/connectivity', name: 'Connectivity', component: Connectivity },
  { path: '/audit', name: 'Audit log', component: AuditLogs },
  { path: '/styleguide', name: 'Style guide', component: StyleGuide },

  // Redirects — every pre-restructure path lands somewhere sensible.
  { path: '/experience-details', redirect: '/analytics' },
  { path: '/reports', redirect: '/analytics' },
  { path: '/devices', redirect: to => ({ path: '/hosts', query: to.query }) },
  { path: '/timeline', redirect: '/gitops' },
  { path: '/changeboard', redirect: '/gitops' },
  { path: '/overview', redirect: '/' },
  { path: '/raw', redirect: '/' },
  { path: '/firehose', redirect: '/' },
  { path: '/firehose/experience', redirect: '/analytics' },
  { path: '/firehose/devices', redirect: '/hosts' },
  { path: '/firehose/reports', redirect: '/analytics' },
  { path: '/firehose/insights', redirect: '/insights' },
  { path: '/firehose/timeline', redirect: '/gitops' },
  { path: '/firehose/changeboard', redirect: '/gitops' },
]

export default createRouter({
  history: createWebHistory(),
  routes
})
