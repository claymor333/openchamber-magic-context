import { stat } from 'node:fs';
import type { DatabaseSync as DatabaseSyncType, SQLInputValue, SQLOutputValue } from 'node:sqlite';
import * as z from 'zod/mini';
import { defaultDataPaths, type DataPaths } from './config.js';
import { readLiveSidebar } from './magic-context-rpc.js';
import type {
  CacheCause,
  CacheEvent,
  DatabaseDiagnostics,
  DiagnosticsResponse,
  ProviderStatus,
  SourceId,
  SourceState,
} from '../shared.js';

const MAX_CACHE_ROWS = 50;
const MESSAGE_TABLES = ['message', 'session_message'] as const;
const COUNT_TABLES = ['compartments', 'memories', 'pending_ops', 'notes'] as const;
const USAGE_COLUMNS = [
  'last_input_tokens',
  'last_context_percentage',
  'last_usage_percentage',
  'last_usage_context_limit',
] as const;

type SqliteModule = typeof import('node:sqlite');
type OpenCodeCacheEvent = { messageId: string | null; event: CacheEvent };
type OpenCodeCacheEvents = { state: SourceState; lastInputTokens: number | null; events: OpenCodeCacheEvent[] };
type ContextDatabaseResult = {
  state: SourceState;
  counts: DatabaseDiagnostics['magicContext']['counts'];
  context: DatabaseDiagnostics['magicContext']['context'];
  causes: Map<string, CacheCause>;
  transformDecisionsCapability: ProviderStatus['capabilities'][number]['state'];
};

const sqliteNumberSchema = z.union([
  z.number(),
  z.bigint(),
  z.string().check(z.trim(), z.minLength(1)),
]);
const sqliteStringSchema = z.string().check(z.minLength(1));

export type { DataPaths };

let sqliteModulePromise: Promise<SqliteModule | null> | null = null;

const loadSqlite = (): Promise<SqliteModule | null> => {
  sqliteModulePromise ??= import('node:sqlite').catch(() => null);
  return sqliteModulePromise;
};

const fileState = (filePath: string): Promise<SourceState> => new Promise((resolve) => {
  stat(filePath, (error) => {
    if (!error) resolve('ready');
    else resolve(error.code === 'ENOENT' ? 'missing' : 'error');
  });
});

export const resolveDataPaths = defaultDataPaths;

const finiteNumber = (value: SQLOutputValue | undefined): number | null => {
  const parsed = sqliteNumberSchema.safeParse(value);
  if (!parsed.success) return null;
  const number = Number(parsed.data);
  return Number.isFinite(number) ? number : null;
};

const stringValue = (value: SQLOutputValue | undefined): string | null => {
  const parsed = sqliteStringSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const timestamp = (value: SQLOutputValue | undefined): string | null => {
  const text = sqliteStringSchema.safeParse(value);
  if (text.success) {
    const parsed = Date.parse(text.data);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const number = finiteNumber(value);
  if (number === null) return null;
  const milliseconds = number < 1_000_000_000_000 ? number * 1000 : number;
  const parsed = new Date(milliseconds);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const ratio = (cacheRead: number | null, inputTokens: number | null): number | null => {
  if (cacheRead === null || inputTokens === null || cacheRead + inputTokens <= 0) return null;
  return Math.max(0, Math.min(1, cacheRead / (cacheRead + inputTokens)));
};

const safeCause = (decision: string | null, reason: string | null, emergency: number | null): CacheCause | null => {
  if (emergency === 1) return 'emergency';
  const normalizedDecision = (decision ?? '').toLowerCase();
  if (normalizedDecision.includes('material')) return 'materialized';
  if (normalizedDecision.includes('threshold')) return 'threshold';
  if (normalizedDecision.includes('compact')) return 'compaction';
  if (normalizedDecision.includes('cache')) return 'cache';
  const combined = (reason ?? '').toLowerCase();
  if (combined.includes('threshold')) return 'threshold';
  if (combined.includes('material')) return 'materialized';
  if (combined.includes('compact')) return 'compaction';
  if (combined.includes('cache')) return 'cache';
  return combined.trim() ? 'unknown' : null;
};

const quoteIdentifier = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

const tableNames = (database: DatabaseSyncType): Set<string> => {
  const rows = database.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all();
  const names = new Set<string>();
  for (const row of rows) {
    const name = stringValue(row.name);
    if (name) names.add(name);
  }
  return names;
};

const tableColumns = (database: DatabaseSyncType, table: string): Set<string> => {
  const rows = database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
  const names = new Set<string>();
  for (const row of rows) {
    const name = stringValue(row.name);
    if (name) names.add(name);
  }
  return names;
};

const countRows = (database: DatabaseSyncType, table: string, sessionId: string | null): number | null => {
  const columns = tableColumns(database, table);
  if (!columns.size) return null;
  const clauses: string[] = [];
  const parameters: SQLInputValue[] = [];
  if (sessionId && columns.has('session_id')) {
    clauses.push(`${quoteIdentifier('session_id')} = ?`);
    parameters.push(sessionId);
  }
  if (columns.has('deleted_at')) clauses.push(`${quoteIdentifier('deleted_at')} IS NULL`);
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const result = database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}${where}`).get(...parameters);
  return finiteNumber(result?.count);
};

const usageFromContextDb = (database: DatabaseSyncType, sessionId: string | null): DatabaseDiagnostics['magicContext']['context'] => {
  if (!sessionId) return null;
  const tables = tableNames(database);
  if (!tables.has('session_meta')) return null;
  const columns = tableColumns(database, 'session_meta');
  if (!columns.has('session_id')) return null;
  const selected = USAGE_COLUMNS.filter((column) => columns.has(column));
  if (!selected.length) return null;
  const filters = [`${quoteIdentifier('session_id')} = ?`];
  const parameters: SQLInputValue[] = [sessionId];
  if (columns.has('harness')) {
    filters.push(`${quoteIdentifier('harness')} = ?`);
    parameters.push('opencode');
  }
  const fields = selected.map(quoteIdentifier).join(', ');
  const row = database.prepare(`SELECT ${fields} FROM ${quoteIdentifier('session_meta')} WHERE ${filters.join(' AND ')} LIMIT 1`).get(...parameters);
  if (!row) return null;
  const usagePercent = finiteNumber(row.last_context_percentage) ?? finiteNumber(row.last_usage_percentage);
  return {
    inputTokens: finiteNumber(row.last_input_tokens),
    contextLimit: finiteNumber(row.last_usage_context_limit),
    usagePercent: usagePercent === null ? null : Math.max(0, Math.min(100, usagePercent)),
  };
};

const contextDatabase = async (filePath: string, sessionId: string | null, messageIds: string[], sqlite: SqliteModule | null): Promise<ContextDatabaseResult> => {
  if (!sqlite) return { state: 'unsupported', counts: null, context: null, causes: new Map(), transformDecisionsCapability: 'unsupported' };
  const pathState = await fileState(filePath);
  if (pathState !== 'ready') return { state: pathState, counts: null, context: null, causes: new Map(), transformDecisionsCapability: 'unavailable' };
  let database: DatabaseSyncType | null = null;
  try {
    database = new sqlite.DatabaseSync(filePath, { readOnly: true });
    database.exec('PRAGMA query_only = ON');
    const tables = tableNames(database);
    const counts: NonNullable<DatabaseDiagnostics['magicContext']['counts']> = {
      compartments: tables.has('compartments') ? countRows(database, 'compartments', sessionId) : null,
      memories: tables.has('memories') ? countRows(database, 'memories', sessionId) : null,
      pendingOps: tables.has('pending_ops') ? countRows(database, 'pending_ops', sessionId) : null,
      sessionNotes: tables.has('notes') ? countRows(database, 'notes', sessionId) : null,
    };
    const context = usageFromContextDb(database, sessionId);
    const causes = readDecisionCauses(database, sessionId, messageIds);
    const anyTable = COUNT_TABLES.some((table) => tables.has(table)) || tables.has('session_meta');
    let transformDecisionsCapability: ProviderStatus['capabilities'][number]['state'] = 'unsupported';
    if (tables.has('transform_decisions')) {
      const columns = tableColumns(database, 'transform_decisions');
      const hasDecisionFields = ['decision', 'materialize_reason', 'emergency'].some((column) => columns.has(column));
      transformDecisionsCapability = columns.has('session_id') && columns.has('message_id') && hasDecisionFields
        ? 'available'
        : 'partial';
    }
    return {
      state: anyTable ? 'ready' : 'partial',
      counts,
      context,
      causes,
      transformDecisionsCapability,
    };
  } catch {
    return { state: 'error', counts: null, context: null, causes: new Map(), transformDecisionsCapability: 'unavailable' };
  } finally {
    database?.close();
  }
};

const readDecisionCauses = (database: DatabaseSyncType, sessionId: string | null, messageIds: string[]): Map<string, CacheCause> => {
  if (!sessionId || !messageIds.length || !tableNames(database).has('transform_decisions')) return new Map();
  const columns = tableColumns(database, 'transform_decisions');
  if (!columns.has('session_id') || !columns.has('message_id')) return new Map();
  const selected = ['message_id', 'decision', 'materialize_reason', 'emergency'].filter((column) => columns.has(column));
  if (selected.length < 2) return new Map();
  const filters = [`${quoteIdentifier('session_id')} = ?`];
  const parameters: SQLInputValue[] = [sessionId];
  if (columns.has('harness')) {
    filters.push(`${quoteIdentifier('harness')} = ?`);
    parameters.push('opencode');
  }
  filters.push(`${quoteIdentifier('message_id')} IN (${messageIds.map(() => '?').join(', ')})`);
  parameters.push(...messageIds);
  const rows = database.prepare(
    `SELECT ${selected.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier('transform_decisions')} WHERE ${filters.join(' AND ')} LIMIT ${messageIds.length}`,
  ).all(...parameters);
  const causes = new Map<string, CacheCause>();
  for (const row of rows) {
    const id = stringValue(row.message_id);
    if (!id) continue;
    const cause = safeCause(stringValue(row.decision), stringValue(row.materialize_reason), finiteNumber(row.emergency));
    if (cause) causes.set(id, cause);
  }
  return causes;
};

const openCodeCacheEvents = (database: DatabaseSyncType, sessionId: string | null): OpenCodeCacheEvents => {
  if (!sessionId) return { state: 'partial', lastInputTokens: null, events: [] };
  const tables = tableNames(database);
  const table = MESSAGE_TABLES.find((name) => tables.has(name));
  if (!table) return { state: 'partial', lastInputTokens: null, events: [] };
  const columns = tableColumns(database, table);
  const timeColumn = columns.has('time_created') ? 'time_created' : columns.has('created_at') ? 'created_at' : null;
  if (!columns.has('id') || !columns.has('session_id') || !columns.has('data') || !timeColumn) {
    return { state: 'partial', lastInputTokens: null, events: [] };
  }
  const roleExpression = `CASE WHEN json_valid(${quoteIdentifier('data')}) THEN json_extract(${quoteIdentifier('data')}, '$.role') END`;
  const filters = [`${roleExpression} = 'assistant'`];
  const parameters: SQLInputValue[] = [];
  if (sessionId) {
    filters.push(`${quoteIdentifier('session_id')} = ?`);
    parameters.push(sessionId);
  }
  const rows = database.prepare(`
    SELECT ${quoteIdentifier('id')} AS message_id, ${quoteIdentifier(timeColumn)} AS created_at,
      json_extract(${quoteIdentifier('data')}, '$.role') AS role,
      json_extract(${quoteIdentifier('data')}, '$.tokens.input') AS input_tokens,
      json_extract(${quoteIdentifier('data')}, '$.tokens.cache.read') AS cache_read,
      json_extract(${quoteIdentifier('data')}, '$.tokens.cache.write') AS cache_write,
      json_extract(${quoteIdentifier('data')}, '$.tokens.total') AS total_tokens
    FROM ${quoteIdentifier(table)} WHERE ${filters.join(' AND ')}
    ORDER BY ${quoteIdentifier(timeColumn)} DESC LIMIT ${MAX_CACHE_ROWS}
  `).all(...parameters);
  const events: OpenCodeCacheEvent[] = [];
  let assistantRows = 0;
  let usageShapeSeen = false;
  for (const row of rows) {
    if (stringValue(row.role) !== 'assistant') continue;
    assistantRows += 1;
    const inputTokens = finiteNumber(row.input_tokens);
    const cacheRead = finiteNumber(row.cache_read);
    const cacheWrite = finiteNumber(row.cache_write);
    const rowTotalTokens = finiteNumber(row.total_tokens);
    usageShapeSeen ||= inputTokens !== null || cacheRead !== null || cacheWrite !== null || rowTotalTokens !== null;
    const totalTokens = rowTotalTokens ?? [inputTokens, cacheRead, cacheWrite]
      .reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (totalTokens <= 0) continue;
    const messageId = stringValue(row.message_id);
    events.push({
      messageId,
      event: {
        at: timestamp(row.created_at),
        inputTokens,
        cacheRead,
        cacheWrite,
        totalTokens,
        hitRatio: ratio(cacheRead, inputTokens),
        cause: null,
      },
    });
  }
  return {
    state: assistantRows > 0 && !usageShapeSeen ? 'partial' : 'ready',
    lastInputTokens: events[0]?.event.inputTokens ?? null,
    events,
  };
};

const openCodeDatabase = async (filePath: string, sessionId: string | null, sqlite: SqliteModule | null): Promise<OpenCodeCacheEvents> => {
  if (!sqlite) return { state: 'unsupported', lastInputTokens: null, events: [] };
  const pathState = await fileState(filePath);
  if (pathState !== 'ready') return { state: pathState, lastInputTokens: null, events: [] };
  let database: DatabaseSyncType | null = null;
  try {
    database = new sqlite.DatabaseSync(filePath, { readOnly: true });
    database.exec('PRAGMA query_only = ON');
    return openCodeCacheEvents(database, sessionId);
  } catch {
    return { state: 'error', lastInputTokens: null, events: [] };
  } finally {
    database?.close();
  }
};

const statusFor = (source: SourceId, state: SourceState, observedAt: string, capabilities: ProviderStatus['capabilities']): ProviderStatus => ({
  source,
  state,
  observedAt,
  freshness: state === 'ready' || state === 'partial' ? 'fresh' : 'unknown',
  ageMs: 0,
  capabilities,
});

export const MagicContextDatabaseProvider = {
  read: contextDatabase,
};

export const OpenCodeUsageProvider = {
  read: openCodeDatabase,
};

export const emptyDatabaseDiagnostics = (): DatabaseDiagnostics => ({
  magicContext: { counts: null, context: null },
  openCode: { lastInputTokens: null, cacheEvents: [] },
});

export const readDatabaseProviders = async ({
  sessionId,
  paths,
  sqlite: sqliteOverride,
  now = () => new Date(),
}: {
  sessionId: string | null;
  paths: DataPaths;
  sqlite?: SqliteModule | null;
  now?: () => Date;
}): Promise<{
  database: DatabaseDiagnostics;
  magicContextStatus: ProviderStatus;
  openCodeStatus: ProviderStatus;
}> => {
  const sqlite = sqliteOverride === undefined ? await loadSqlite() : sqliteOverride;
  const openCode = await OpenCodeUsageProvider.read(paths.openCodeDatabase, sessionId, sqlite);
  const messageIds = openCode.events.flatMap(({ messageId }) => messageId ? [messageId] : []);
  const contextWithCauses = await MagicContextDatabaseProvider.read(paths.magicContextDatabase, sessionId, messageIds, sqlite);
  const observedAt = now().toISOString();
  const mcCountValues = contextWithCauses.counts ? Object.values(contextWithCauses.counts) : [];
  const mcCountsCapability = contextWithCauses.state === 'unsupported'
    ? 'unsupported'
    : contextWithCauses.state === 'missing' || contextWithCauses.state === 'error'
      ? 'unavailable'
      : contextWithCauses.counts && mcCountValues.every((value) => value !== null)
        ? 'available'
        : 'partial';
  const mcState = contextWithCauses.state === 'ready' && mcCountsCapability === 'available'
    ? 'ready'
    : contextWithCauses.state === 'ready' ? 'partial' : contextWithCauses.state;
  const magicContextStatus = statusFor('magic-context-db', mcState, observedAt, [
    { id: 'db.session-counts', state: mcCountsCapability },
    { id: 'db.session-usage', state: contextWithCauses.state === 'unsupported' ? 'unsupported' : contextWithCauses.state === 'missing' || contextWithCauses.state === 'error' ? 'unavailable' : contextWithCauses.context ? 'available' : 'partial' },
    { id: 'db.transform-decisions', state: contextWithCauses.state === 'unsupported' ? 'unsupported' : contextWithCauses.state === 'missing' || contextWithCauses.state === 'error' ? 'unavailable' : contextWithCauses.transformDecisionsCapability },
  ]);
  const openCodeStatus = statusFor('opencode-db', openCode.state, observedAt, [
    { id: 'db.assistant-usage', state: openCode.state === 'ready' ? 'available' : openCode.state === 'partial' ? 'partial' : openCode.state === 'unsupported' ? 'unsupported' : 'unavailable' },
  ]);
  return {
    database: {
      magicContext: {
        counts: contextWithCauses.counts,
        context: contextWithCauses.context,
      },
      openCode: {
        lastInputTokens: openCode.lastInputTokens,
        cacheEvents: openCode.events.map(({ messageId, event }) => ({
          ...event,
          cause: messageId ? contextWithCauses.causes.get(messageId) ?? null : null,
        })),
      },
    },
    magicContextStatus,
    openCodeStatus,
  };
};

const unavailableStatus = (source: SourceId, observedAt: string): ProviderStatus => statusFor(source, 'error', observedAt, []);
const noProjectStatus = (observedAt: string): ProviderStatus => statusFor('magic-context-rpc', 'missing', observedAt, [
  { id: 'rpc.bearer-auth', state: 'unavailable' },
  { id: 'rpc.sidebar-snapshot', state: 'unavailable' },
  { id: 'rpc.status-detail', state: 'unavailable' },
]);

export const buildSnapshot = async ({
  sessionId,
  directory,
  paths,
  logStatus,
  configurationValid = true,
  now = () => new Date(),
}: {
  sessionId: string | null;
  directory: string | null;
  paths: DataPaths;
  logStatus: ProviderStatus;
  configurationValid?: boolean;
  now?: () => Date;
}): Promise<DiagnosticsResponse> => {
  const observedAt = now().toISOString();
  if (!configurationValid) {
    return {
      schemaVersion: 2,
      observedAt,
      sessionId,
      sources: {
        liveRpc: unavailableStatus('magic-context-rpc', observedAt),
        magicContextDatabase: unavailableStatus('magic-context-db', observedAt),
        openCodeDatabase: unavailableStatus('opencode-db', observedAt),
        logTail: logStatus,
      },
      liveSidebar: null,
      database: emptyDatabaseDiagnostics(),
    };
  }

  const [live, databases] = await Promise.all([
    directory
      ? readLiveSidebar({ storageDir: paths.magicContextStorageDir, directory, sessionId, now })
      : Promise.resolve({ status: noProjectStatus(now().toISOString()), sidebar: null }),
    readDatabaseProviders({ sessionId, paths, now }),
  ]);
  return {
    schemaVersion: 2,
    observedAt,
    sessionId,
    sources: {
      liveRpc: live.status,
      magicContextDatabase: databases.magicContextStatus,
      openCodeDatabase: databases.openCodeStatus,
      logTail: logStatus,
    },
    liveSidebar: live.sidebar,
    database: databases.database,
  };
};
