/**
 * ClickHouse client for Cloudflare Workers.
 *
 * Uses @clickhouse/client-web (browser-compatible HTTP client).
 * Credentials come from Worker env vars — never exposed to the browser.
 */
import { createClient, type ClickHouseClient } from '@clickhouse/client-web'
import type { Env } from './types'

let client: ClickHouseClient | null = null

/** Get or create a ClickHouse client from Worker env bindings. */
function getClient(env: Env): ClickHouseClient {
  // Re-create client per request in Workers (no persistent state between requests)
  // The @clickhouse/client-web uses fetch internally, which is fine in Workers
  return createClient({
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD || '',
    database: env.CLICKHOUSE_DATABASE || 'fleet_logs',
    clickhouse_settings: {
      output_format_json_quote_64bit_integers: 0,
      max_execution_time: 30,
      max_result_rows: 10000,
    },
  })
}

/** Get a ClickHouse client for the alt instance (osquery result logs). */
function getAltClient(env: Env): ClickHouseClient {
  if (!env.ALT_CLICKHOUSE_URL) {
    throw new Error('ALT_CLICKHOUSE_URL is not configured')
  }
  return createClient({
    url: env.ALT_CLICKHOUSE_URL,
    username: env.ALT_CLICKHOUSE_USER || 'default',
    password: env.ALT_CLICKHOUSE_PASSWORD || '',
    database: env.ALT_CLICKHOUSE_DATABASE || 'default',
    clickhouse_settings: {
      output_format_json_quote_64bit_integers: 0,
      max_execution_time: 30,
      max_result_rows: 10000,
    },
  })
}

/**
 * Execute a parameterized query against ClickHouse.
 *
 * @param sql - SQL string with {name:Type} placeholders
 * @param params - Parameter values matching the placeholders
 * @param env - Worker environment bindings
 * @returns Array of row objects
 */
export async function executeQuery(
  sql: string,
  params: Record<string, unknown>,
  env: Env
): Promise<Record<string, unknown>[]> {
  const ch = getClient(env)
  try {
    const result = await ch.query({
      query: sql,
      query_params: params,
      format: 'JSONEachRow',
    })
    return await result.json<Record<string, unknown>>()
  } finally {
    await ch.close()
  }
}

/**
 * Execute a parameterized query against the alt ClickHouse instance.
 */
export async function executeAltQuery(
  sql: string,
  params: Record<string, unknown>,
  env: Env
): Promise<Record<string, unknown>[]> {
  const ch = getAltClient(env)
  try {
    const result = await ch.query({
      query: sql,
      query_params: params,
      format: 'JSONEachRow',
    })
    return await result.json<Record<string, unknown>>()
  } finally {
    await ch.close()
  }
}

/**
 * Ping ClickHouse to verify connectivity.
 */
export async function pingClickHouse(env: Env): Promise<boolean> {
  const ch = getClient(env)
  try {
    const result = await ch.ping()
    return result.success
  } finally {
    await ch.close()
  }
}
