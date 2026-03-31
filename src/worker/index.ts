import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { basicAuth } from 'hono/basic-auth'
import type { Env, QueryRequest } from './types'
import { registry, RegistryError } from './query-registry'
import { pingClickHouse } from './clickhouse-client'
import { cfAccessAuth } from './auth'

// ─── Register query domains ──────────────────────────────
import { healthQueries } from './queries/health'
import { deviceQueries } from './queries/devices'
import { securityQueries } from './queries/security'
import { processQueries } from './queries/processes'
import { networkQueries } from './queries/network'
import { auditQueries } from './queries/audit'
import { softwareQueries } from './queries/software'
import { scoreQueries } from './queries/scores'

registry.registerAll(healthQueries)
registry.registerAll(deviceQueries)
registry.registerAll(securityQueries)
registry.registerAll(processQueries)
registry.registerAll(networkQueries)
registry.registerAll(auditQueries)
registry.registerAll(softwareQueries)
registry.registerAll(scoreQueries)

// ─── Hono app ────────────────────────────────────────────
const app = new Hono<{ Bindings: Env }>()

// Basic auth — protects all routes (UI + API) when configured
app.use('*', async (c, next) => {
  const user = c.env.BASIC_AUTH_USER
  const pass = c.env.BASIC_AUTH_PASS
  if (!user || !pass) return next()
  return basicAuth({ username: user, password: pass })(c, next)
})

// Middleware
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST'], maxAge: 3600 }))
app.use('/api/*', cfAccessAuth())

// Request logging
app.use('/api/*', async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`)
})

// ─── GET /health — connectivity check ───────────────────
app.get('/health', async (c) => {
  try {
    const ok = await pingClickHouse(c.env)
    return c.json({
      status: ok ? 'ok' : 'clickhouse_unreachable',
      queries_registered: registry.size,
    })
  } catch {
    return c.json({ status: 'ok', clickhouse: 'unreachable', queries_registered: registry.size })
  }
})

// ─── POST /api/query — main query endpoint ──────────────
app.post('/api/query', async (c) => {
  let body: QueryRequest
  try {
    body = await c.req.json<QueryRequest>()
  } catch {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } }, 400)
  }

  if (!body.query) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Missing "query" field' } }, 400)
  }

  try {
    const result = await registry.execute(body.query, body.params || {}, c.env)
    return c.json(result)
  } catch (err) {
    if (err instanceof RegistryError) {
      const status = err.code === 'UNKNOWN_QUERY' ? 404 : 400
      return c.json({ error: { code: err.code, message: err.message, param: err.param } }, status)
    }
    console.error('Query execution error:', err)
    return c.json(
      { error: { code: 'QUERY_ERROR', message: err instanceof Error ? err.message : 'Unknown error' } },
      500
    )
  }
})

// ─── GET /api/queries — list all registered queries ─────
app.get('/api/queries', (c) => {
  const domain = c.req.query('domain')
  let queries = registry.list()
  if (domain) {
    queries = queries.filter((q) => q.domain === domain)
  }
  return c.json({ queries, total: queries.length })
})

// ─── GET /api/queries/:name — inspect a single query ────
app.get('/api/queries/:name', (c) => {
  const name = c.req.param('name')
  const config = registry.get(name)
  if (!config) {
    return c.json({ error: { code: 'UNKNOWN_QUERY', message: `Query '${name}' not found` } }, 404)
  }
  return c.json({
    name: config.name,
    domain: config.domain,
    description: config.description,
    params: config.params,
  })
})

export default app
