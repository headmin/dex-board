/**
 * Dev-only Vite plugin: serve a Fleet report CSV export as if it were the
 * `firehose.ai.inventory` query result.
 *
 * The AI tool inventory queries run in Fleet, but their results are not yet
 * flowing into the firehose ClickHouse. Until they are, the dashboard reads a
 * CSV export from `local-data/ai-inventory.csv` (override with the
 * AI_INVENTORY_CSV env var) through GET /api/local/ai-inventory.
 *
 * Node-side code — never bundled into the SPA and never part of the Worker.
 * `apply: 'serve'` keeps it out of `vite build`, so a deployed board has no
 * /api/local route at all and useAiInventory falls through to its
 * "not available yet" state.
 */
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_CSV = 'local-data/ai-inventory.csv'
const ROUTE = '/api/local/ai-inventory'

/**
 * Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF line
 * ends, and newlines inside quotes (the `detail` column embeds JSON with
 * escaped quotes, so a split-on-comma approach would shred it).
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { quoted = false }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  if (!rows.length) return []
  const header = rows[0].map(h => h.replace(/^﻿/, ''))
  return rows.slice(1)
    .filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''))
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

export function loadInventoryCsv(root, file = process.env.AI_INVENTORY_CSV || DEFAULT_CSV) {
  const abs = resolve(root, file)
  const stat = statSync(abs)
  const data = parseCsv(readFileSync(abs, 'utf8'))
  return {
    data,
    meta: {
      source: 'local-csv',
      file,
      modified: stat.mtime.toISOString(),
      rows: data.length,
    },
  }
}

export default function localAiInventory() {
  return {
    name: 'dex-local-ai-inventory',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ROUTE, (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end()
          return
        }
        try {
          const payload = loadInventoryCsv(server.config.root)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.statusCode = err.code === 'ENOENT' ? 404 : 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: {
              code: err.code === 'ENOENT' ? 'NO_LOCAL_EXPORT' : 'PARSE_ERROR',
              message: err.code === 'ENOENT'
                ? `No local export at ${process.env.AI_INVENTORY_CSV || DEFAULT_CSV}`
                : err.message,
            },
          }))
        }
      })
    },
  }
}
