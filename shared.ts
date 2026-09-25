import * as z from 'zod/mini';

export const sourceStateSchema = z.enum(['ready', 'partial', 'missing', 'unsupported', 'error', 'unknown']);
export type SourceState = z.infer<typeof sourceStateSchema>;

export const freshnessSchema = z.enum(['fresh', 'stale', 'unknown']);
export type Freshness = z.infer<typeof freshnessSchema>;

export const sourceIdSchema = z.enum(['magic-context-rpc', 'magic-context-db', 'opencode-db', 'magic-context-log']);
export type SourceId = z.infer<typeof sourceIdSchema>;

export const capabilityIdSchema = z.enum([
  'rpc.discovery', 'rpc.sidebar-snapshot', 'rpc.sidebar-composition', 'rpc.sidebar-counts',
  'rpc.status-detail', 'rpc.activity-status', 'rpc.transform-status', 'rpc.cache-status', 'rpc.bearer-auth',
  'db.session-usage', 'db.session-counts', 'db.transform-decisions', 'db.assistant-usage',
  'log.incremental-tail', 'log.metadata-parser',
]);
export const capabilityStateSchema = z.enum(['available', 'partial', 'unsupported', 'unavailable']);

export const providerStatusSchema = z.object({
  source: sourceIdSchema,
  state: sourceStateSchema,
  observedAt: z.nullable(z.string()),
  freshness: freshnessSchema,
  ageMs: z.nullable(z.number()),
  capabilities: z.array(z.object({
    id: capabilityIdSchema,
    state: capabilityStateSchema,
  })),
});
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const cacheCauseSchema = z.enum(['emergency', 'threshold', 'materialized', 'compaction', 'cache', 'unknown']);
export type CacheCause = z.infer<typeof cacheCauseSchema>;

export const cacheEventSchema = z.object({
  at: z.nullable(z.string()),
  inputTokens: z.nullable(z.number()),
  cacheRead: z.nullable(z.number()),
  cacheWrite: z.nullable(z.number()),
  totalTokens: z.nullable(z.number()),
  hitRatio: z.nullable(z.number()),
  cause: z.nullable(cacheCauseSchema),
});
export type CacheEvent = z.infer<typeof cacheEventSchema>;

export const transformPhaseSchema = z.enum(['recomp', 'migration', 'done', 'failed', 'skipped']);

export const recompProgressSchema = z.object({
  kind: z.nullable(z.enum(['recomp', 'upgrade', 'embed', 'wrapup'])),
  phase: transformPhaseSchema,
  processedMessages: z.nullable(z.number()),
  totalMessages: z.nullable(z.number()),
  passCount: z.nullable(z.number()),
  compartmentsCreated: z.nullable(z.number()),
});

export const liveSidebarSchema = z.object({
  usage: z.object({
    inputTokens: z.nullable(z.number()),
    contextLimit: z.nullable(z.number()),
    usagePercent: z.nullable(z.number()),
  }),
  composition: z.object({
    systemPromptTokens: z.nullable(z.number()),
    conversationTokens: z.nullable(z.number()),
    toolCallTokens: z.nullable(z.number()),
    toolDefinitionTokens: z.nullable(z.number()),
    compartmentTokens: z.nullable(z.number()),
    factTokens: z.nullable(z.number()),
    memoryTokens: z.nullable(z.number()),
    docsTokens: z.nullable(z.number()),
    profileTokens: z.nullable(z.number()),
  }),
  counts: z.object({
    compartments: z.nullable(z.number()),
    memories: z.nullable(z.number()),
    memoryBlocks: z.nullable(z.number()),
    pendingOperations: z.nullable(z.number()),
    sessionNotes: z.nullable(z.number()),
    readySmartNotes: z.nullable(z.number()),
  }),
  activity: z.object({
    historianRunning: z.nullable(z.boolean()),
    dreamerRunning: z.nullable(z.boolean()),
    lastDreamerRunAt: z.nullable(z.number()),
    historianFailures: z.nullable(z.number()),
  }),
  transform: z.object({
    hasLastError: z.nullable(z.boolean()),
    inProgress: z.nullable(z.boolean()),
    recomp: z.nullable(recompProgressSchema),
  }),
  cache: z.object({
    ttlMs: z.nullable(z.number()),
    remainingMs: z.nullable(z.number()),
    expired: z.nullable(z.boolean()),
    thresholdPercent: z.nullable(z.number()),
  }),
});
export type LiveSidebar = z.infer<typeof liveSidebarSchema>;

export const durableCountsSchema = z.object({
  compartments: z.nullable(z.number()),
  memories: z.nullable(z.number()),
  pendingOps: z.nullable(z.number()),
  sessionNotes: z.nullable(z.number()),
});

export const durableContextSchema = z.object({
  inputTokens: z.nullable(z.number()),
  contextLimit: z.nullable(z.number()),
  usagePercent: z.nullable(z.number()),
});

export const databaseDiagnosticsSchema = z.object({
  magicContext: z.object({
    counts: z.nullable(durableCountsSchema),
    context: z.nullable(durableContextSchema),
  }),
  openCode: z.object({
    lastInputTokens: z.nullable(z.number()),
    cacheEvents: z.array(cacheEventSchema),
  }),
});
export type DatabaseDiagnostics = z.infer<typeof databaseDiagnosticsSchema>;

export const snapshotDtoSchema = z.object({
  schemaVersion: z.literal(2),
  observedAt: z.string(),
  sessionId: z.nullable(z.string()),
  sources: z.object({
    liveRpc: providerStatusSchema,
    magicContextDatabase: providerStatusSchema,
    openCodeDatabase: providerStatusSchema,
    logTail: providerStatusSchema,
  }),
  liveSidebar: z.nullable(liveSidebarSchema),
  database: databaseDiagnosticsSchema,
});
export type SnapshotDto = z.infer<typeof snapshotDtoSchema>;
// Kept as an extension-local alias while the panel calls its snapshot "diagnostics".
export type DiagnosticsResponse = SnapshotDto;

export const streamEventSchema = z.object({
  id: z.string(),
  at: z.nullable(z.string()),
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error']),
  category: z.enum(['cache', 'stream', 'historian', 'dreamer', 'transform']),
  inputTokens: z.nullable(z.number()),
  cacheRead: z.nullable(z.number()),
  cacheWrite: z.nullable(z.number()),
});
export type StreamEvent = z.infer<typeof streamEventSchema>;

export const eventGapSchema = z.enum([
  'initial-tail', 'rotation', 'truncation', 'backpressure', 'retention', 'cursor-expired', 'source-unavailable', 'format-unsupported',
]);
export type EventGapDto = z.infer<typeof eventGapSchema>;

export const eventPageDtoSchema = z.object({
  schemaVersion: z.literal(1),
  observedAt: z.string(),
  source: providerStatusSchema,
  cursor: z.nullable(z.string()),
  events: z.array(streamEventSchema),
  gaps: z.array(eventGapSchema),
  retainedEvents: z.number(),
});
export type EventPageDto = z.infer<typeof eventPageDtoSchema>;

export const parseDiagnosticsResponse = (body: string): DiagnosticsResponse | null => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch {
    return null;
  }
  const result = snapshotDtoSchema.safeParse(decoded);
  return result.success ? result.data : null;
};

export const parseEventPage = (body: string): EventPageDto | null => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch {
    return null;
  }
  const result = eventPageDtoSchema.safeParse(decoded);
  return result.success ? result.data : null;
};

export type SessionRefreshStamp = { sessionId: string | null; generation: number };

export const isCurrentSessionRefresh = (requested: SessionRefreshStamp, current: SessionRefreshStamp): boolean =>
  requested.sessionId === current.sessionId && requested.generation === current.generation;

export const preserveLastGoodEvents = (previous: EventPageDto | undefined, next: EventPageDto): EventPageDto =>
  previous && ['error', 'missing', 'unsupported'].includes(next.source.state)
    ? { ...previous, source: { ...next.source, freshness: 'stale' } }
    : next;
