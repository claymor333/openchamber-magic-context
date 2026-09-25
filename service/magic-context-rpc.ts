import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type LiveSidebar,
  type ProviderStatus,
  type SourceState,
} from '../shared.js';

const MAX_DISCOVERY_FILES = 64;
const MAX_PORT_FILE_BYTES = 8 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 2_000;
const RPC_METHODS = ['sidebar-snapshot', 'status-detail'] as const;
type RpcMethod = (typeof RPC_METHODS)[number];

type PortRecord = {
  port: number;
  pid: number;
  started_at: number;
  token: string;
  instance_id?: string;
};

type RpcEndpoint = PortRecord;
type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
type DiscoveryResult = {
  endpoint: RpcEndpoint | null;
  state: SourceState;
  sawIdentityMismatch: boolean;
  sawUnsupportedRecord: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const projectHash = (directory: string): string => createHash('sha256')
  .update(directory.replace(/\/+$/, ''))
  .digest('hex')
  .slice(0, 16);

export const validateProjectDirectory = (value: unknown): value is string =>
  typeof value === 'string'
  && value.length > 0
  && value.length <= 4_096
  && !value.includes('\0')
  && !/(^|[\\/])\.\.([\\/]|$)/.test(value)
  && value.trim() === value
  && path.isAbsolute(value)
  && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value);

export const validateSessionId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const parsePortRecord = (text: string): PortRecord | null => {
  if (Buffer.byteLength(text, 'utf8') > MAX_PORT_FILE_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { port, pid, started_at: startedAt, token, instance_id: instanceId } = value;
  if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65_535) return null;
  if (!Number.isSafeInteger(pid) || (pid as number) < 1) return null;
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt < 0) return null;
  // Current Magic Context servers publish a 32-byte random token as hex. Older
  // unauthenticated discovery variants are intentionally unsupported.
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return null;
  if (instanceId !== undefined && (typeof instanceId !== 'string' || !/^[a-f0-9]{16,64}$/i.test(instanceId))) return null;
  return {
    port: port as number,
    pid: pid as number,
    started_at: startedAt,
    token,
    ...(typeof instanceId === 'string' ? { instance_id: instanceId } : {}),
  };
};

const readPortRecord = async (filePath: string): Promise<PortRecord | null> => {
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(filePath, 'r');
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_PORT_FILE_BYTES) return null;
    const buffer = Buffer.alloc(MAX_PORT_FILE_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_PORT_FILE_BYTES) return null;
    return parsePortRecord(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await handle?.close().catch(() => undefined);
  }
};

const fetchBoundedJson = async (response: Response, maxBytes: number): Promise<unknown | null> => {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;
  try {
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const healthIdentityMatches = (record: PortRecord, body: unknown): boolean => {
  if (!isRecord(body) || body.ok !== true || body.pid !== record.pid) return false;
  const healthInstance = body.instance_id;
  if (healthInstance !== undefined && (typeof healthInstance !== 'string' || !/^[a-f0-9]{16,64}$/i.test(healthInstance))) return false;
  if (record.instance_id === undefined && healthInstance === undefined) return true;
  return typeof healthInstance === 'string' && record.instance_id === healthInstance;
};

const healthCheck = async (record: PortRecord, fetcher: Fetcher): Promise<'ready' | 'mismatch' | 'unavailable'> => {
  try {
    const response = await fetcher(`http://127.0.0.1:${record.port}/health`, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return 'unavailable';
    const body = await fetchBoundedJson(response, 4 * 1024);
    return healthIdentityMatches(record, body) ? 'ready' : 'mismatch';
  } catch {
    return 'unavailable';
  }
};

export const discoverRpcEndpoint = async ({
  storageDir,
  directory,
  fetcher = fetch,
}: {
  storageDir: string;
  directory: string;
  fetcher?: Fetcher;
}): Promise<DiscoveryResult> => {
  if (!validateProjectDirectory(directory) || !path.isAbsolute(storageDir)) {
    return { endpoint: null, state: 'error', sawIdentityMismatch: false, sawUnsupportedRecord: false };
  }
  const discoveryDir = path.join(storageDir, 'rpc', projectHash(directory));
  let entries: Dirent[] = [];
  let exceededDiscoveryLimit = false;
  try {
    const directoryHandle = await fs.opendir(discoveryDir);
    for await (const entry of directoryHandle) {
      if (!entry.isFile() || !/^port-[^/]+\.json$/.test(entry.name)) continue;
      if (entries.length >= MAX_DISCOVERY_FILES) {
        exceededDiscoveryLimit = true;
        break;
      }
      entries.push(entry);
    }
  } catch (error) {
    return {
      endpoint: null,
      state: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'error',
      sawIdentityMismatch: false,
      sawUnsupportedRecord: false,
    };
  }

  const records: PortRecord[] = [];
  let sawUnsupportedRecord = exceededDiscoveryLimit;
  for (const entry of entries) {
    try {
      const filePath = path.join(discoveryDir, entry.name);
      const parsed = await readPortRecord(filePath);
      if (!parsed) {
        sawUnsupportedRecord = true;
        continue;
      }
      records.push(parsed);
    } catch {
      // A port file can disappear during process shutdown. It is not a live endpoint.
    }
  }
  records.sort((left, right) => right.started_at - left.started_at);

  let sawIdentityMismatch = false;
  let sawReachableRecord = false;
  for (const record of records) {
    const health = await healthCheck(record, fetcher);
    if (health === 'ready') {
      return { endpoint: record, state: sawUnsupportedRecord ? 'partial' : 'ready', sawIdentityMismatch, sawUnsupportedRecord };
    }
    if (health === 'mismatch') sawIdentityMismatch = true;
    else sawReachableRecord = true;
  }
  return {
    endpoint: null,
    state: sawIdentityMismatch || sawReachableRecord ? 'error' : sawUnsupportedRecord ? 'unsupported' : 'missing',
    sawIdentityMismatch,
    sawUnsupportedRecord,
  };
};

const finiteValue = (object: Record<string, unknown>, key: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | null => {
  const value = object[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
};

const booleanValue = (object: Record<string, unknown>, key: string): boolean | null =>
  typeof object[key] === 'boolean' ? object[key] as boolean : null;

const safeTtlMs = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  if (value === 'never') return -1;
  const match = value.trim().match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === 'ms' ? 1 : unit === 's' ? 1_000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  const milliseconds = amount * multiplier;
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
};

const safeRecompProgress = (value: unknown): LiveSidebar['transform']['recomp'] => {
  if (!isRecord(value)) return null;
  const phase = value.phase;
  if (!['recomp', 'migration', 'done', 'failed', 'skipped'].includes(String(phase))) return null;
  const processedMessages = finiteValue(value, 'processedMessages');
  const totalMessages = finiteValue(value, 'totalMessages');
  const passCount = finiteValue(value, 'passCount');
  const compartmentsCreated = finiteValue(value, 'compartmentsCreated');
  if (processedMessages === null || totalMessages === null || passCount === null || compartmentsCreated === null) return null;
  const kind = value.kind;
  return {
    kind: kind === 'recomp' || kind === 'upgrade' || kind === 'embed' || kind === 'wrapup' ? kind : null,
    phase: phase as NonNullable<LiveSidebar['transform']['recomp']>['phase'],
    processedMessages,
    totalMessages,
    passCount,
    compartmentsCreated,
  };
};

const mapLiveSidebar = (sidebar: Record<string, unknown>, detail: Record<string, unknown> | null): LiveSidebar => {
  const recomp = safeRecompProgress(sidebar.recompProgress) ?? (detail ? safeRecompProgress(detail.recompProgress) : null);
  const cacheTtlMs = detail ? finiteValue(detail, 'cacheTtlMs', -1) : null;
  const rawCacheTtlMs = cacheTtlMs ?? safeTtlMs(sidebar.cacheTtl);
  const dreamerProgress = sidebar.dreamerProgress;
  return {
    usage: {
      inputTokens: finiteValue(sidebar, 'inputTokens'),
      contextLimit: finiteValue(sidebar, 'contextLimit'),
      usagePercent: finiteValue(sidebar, 'usagePercentage', 0, 100),
    },
    composition: {
      systemPromptTokens: finiteValue(sidebar, 'systemPromptTokens'),
      conversationTokens: finiteValue(sidebar, 'conversationTokens'),
      toolCallTokens: finiteValue(sidebar, 'toolCallTokens'),
      toolDefinitionTokens: finiteValue(sidebar, 'toolDefinitionTokens'),
      compartmentTokens: finiteValue(sidebar, 'compartmentTokens'),
      factTokens: finiteValue(sidebar, 'factTokens'),
      memoryTokens: finiteValue(sidebar, 'memoryTokens'),
      docsTokens: finiteValue(sidebar, 'docsTokens'),
      profileTokens: finiteValue(sidebar, 'profileTokens'),
    },
    counts: {
      compartments: finiteValue(sidebar, 'compartmentCount'),
      memories: finiteValue(sidebar, 'memoryCount'),
      memoryBlocks: finiteValue(sidebar, 'memoryBlockCount'),
      pendingOperations: finiteValue(sidebar, 'pendingOpsCount'),
      sessionNotes: finiteValue(sidebar, 'sessionNoteCount'),
      readySmartNotes: finiteValue(sidebar, 'readySmartNoteCount'),
    },
    activity: {
      historianRunning: booleanValue(sidebar, 'historianRunning'),
      dreamerRunning: dreamerProgress === undefined ? null : dreamerProgress === null ? false : isRecord(dreamerProgress) ? true : null,
      lastDreamerRunAt: finiteValue(sidebar, 'lastDreamerRunAt'),
      historianFailures: detail ? finiteValue(detail, 'historianFailureCount') : null,
    },
    transform: {
      hasLastError: 'lastTransformError' in sidebar && (typeof sidebar.lastTransformError === 'string' || sidebar.lastTransformError === null)
        ? typeof sidebar.lastTransformError === 'string' && sidebar.lastTransformError.length > 0
        : detail && 'lastTransformError' in detail && (typeof detail.lastTransformError === 'string' || detail.lastTransformError === null)
          ? typeof detail.lastTransformError === 'string' && detail.lastTransformError.length > 0
          : null,
      inProgress: booleanValue(sidebar, 'compartmentInProgress'),
      recomp,
    },
    cache: {
      ttlMs: rawCacheTtlMs,
      remainingMs: detail ? finiteValue(detail, 'cacheRemainingMs', -1) : null,
      expired: detail ? booleanValue(detail, 'cacheExpired') : null,
      thresholdPercent: finiteValue(sidebar, 'executeThreshold', 0, 100),
    },
  };
};

const status = (state: SourceState, observedAt: string, capabilities: ProviderStatus['capabilities']): ProviderStatus => ({
  source: 'magic-context-rpc',
  state,
  observedAt,
  freshness: state === 'ready' || state === 'partial' ? 'fresh' : 'unknown',
  ageMs: 0,
  capabilities,
});

const decodeRpcResult = async (response: Response): Promise<{ status: number; body: unknown | null }> => ({
  status: response.status,
  body: await fetchBoundedJson(response, MAX_RESPONSE_BYTES),
});

const invokeAllowlistedRpc = async (
  endpoint: RpcEndpoint,
  method: RpcMethod,
  parameters: Record<string, unknown>,
  fetcher: Fetcher,
): Promise<{ status: number; body: unknown | null }> => {
  // `method` is a closed union whose only call sites are the two constants above.
  if (!(RPC_METHODS as readonly string[]).includes(method)) return { status: 404, body: null };
  const response = await fetcher(`http://127.0.0.1:${endpoint.port}/rpc/${method}`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${endpoint.token}` },
    body: JSON.stringify(parameters),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return decodeRpcResult(response);
};

export const readLiveSidebar = async ({
  storageDir,
  directory,
  sessionId,
  fetcher = fetch,
  now = () => new Date(),
}: {
  storageDir: string;
  directory: string;
  sessionId: string | null;
  fetcher?: Fetcher;
  now?: () => Date;
}): Promise<{ status: ProviderStatus; sidebar: LiveSidebar | null }> => {
  const observedAt = now().toISOString();
  const discovery = await discoverRpcEndpoint({ storageDir, directory, fetcher });
  if (!discovery.endpoint) {
    const state = discovery.state;
    return {
      status: status(state, observedAt, [
        { id: 'rpc.discovery', state: discovery.sawUnsupportedRecord ? 'partial' : 'unavailable' },
        { id: 'rpc.bearer-auth', state: discovery.sawUnsupportedRecord ? 'unsupported' : 'unavailable' },
        { id: 'rpc.sidebar-snapshot', state: 'unavailable' },
        { id: 'rpc.status-detail', state: 'unavailable' },
        { id: 'rpc.activity-status', state: 'unavailable' },
      ]),
      sidebar: null,
    };
  }
  if (!sessionId || !validateSessionId(sessionId)) {
    return {
      status: status('partial', observedAt, [
        { id: 'rpc.discovery', state: discovery.sawUnsupportedRecord ? 'partial' : 'available' },
        { id: 'rpc.bearer-auth', state: 'available' },
        { id: 'rpc.sidebar-snapshot', state: 'unavailable' },
        { id: 'rpc.status-detail', state: 'unavailable' },
        { id: 'rpc.activity-status', state: 'unavailable' },
      ]),
      sidebar: null,
    };
  }

  const parameters = { sessionId, directory };
  let sidebarReply: { status: number; body: unknown | null };
  try {
    sidebarReply = await invokeAllowlistedRpc(discovery.endpoint, 'sidebar-snapshot', parameters, fetcher);
  } catch {
    return {
      status: status('error', now().toISOString(), [
        { id: 'rpc.discovery', state: discovery.sawUnsupportedRecord ? 'partial' : 'available' },
        { id: 'rpc.bearer-auth', state: 'available' },
        { id: 'rpc.sidebar-snapshot', state: 'unavailable' },
        { id: 'rpc.status-detail', state: 'unavailable' },
        { id: 'rpc.activity-status', state: 'unavailable' },
      ]),
      sidebar: null,
    };
  }
  if (!sidebarReply.body || sidebarReply.status < 200 || sidebarReply.status >= 300 || !isRecord(sidebarReply.body)) {
    const unsupported = sidebarReply.status === 404;
    return {
      status: status(unsupported ? 'unsupported' : 'error', now().toISOString(), [
        { id: 'rpc.discovery', state: discovery.sawUnsupportedRecord ? 'partial' : 'available' },
        { id: 'rpc.bearer-auth', state: 'available' },
        { id: 'rpc.sidebar-snapshot', state: unsupported ? 'unsupported' : 'unavailable' },
        { id: 'rpc.status-detail', state: 'unavailable' },
        { id: 'rpc.activity-status', state: 'unavailable' },
      ]),
      sidebar: null,
    };
  }
  const rawSidebar = sidebarReply.body;
  if (typeof rawSidebar.error === 'string') {
    return {
      status: status('error', now().toISOString(), [
        { id: 'rpc.discovery', state: discovery.sawUnsupportedRecord ? 'partial' : 'available' },
        { id: 'rpc.bearer-auth', state: 'available' },
        { id: 'rpc.sidebar-snapshot', state: 'unavailable' },
        { id: 'rpc.status-detail', state: 'unavailable' },
        { id: 'rpc.activity-status', state: 'unavailable' },
      ]),
      sidebar: null,
    };
  }
  if (rawSidebar.sessionId !== sessionId) {
    return {
      status: status('partial', now().toISOString(), [
        { id: 'rpc.discovery', state: discovery.sawUnsupportedRecord ? 'partial' : 'available' },
        { id: 'rpc.bearer-auth', state: 'available' },
        { id: 'rpc.sidebar-snapshot', state: 'partial' },
        { id: 'rpc.status-detail', state: 'unavailable' },
        { id: 'rpc.activity-status', state: 'unavailable' },
      ]),
      sidebar: null,
    };
  }

  let detail: Record<string, unknown> | null = null;
  let detailCapability: ProviderStatus['capabilities'][number]['state'] = 'unavailable';
  try {
    const result = await invokeAllowlistedRpc(discovery.endpoint, 'status-detail', parameters, fetcher);
    if (result.status === 404) detailCapability = 'unsupported';
    else if (result.status >= 200 && result.status < 300 && isRecord(result.body)
      && typeof result.body.error === 'string') detailCapability = 'unavailable';
    else if (result.status >= 200 && result.status < 300 && isRecord(result.body)
      && result.body.sessionId === sessionId) {
      detail = result.body;
      const hasCurrentStatusFields = finiteValue(detail, 'cacheTtlMs', -1) !== null
        && finiteValue(detail, 'cacheRemainingMs', -1) !== null
        && typeof detail.cacheExpired === 'boolean'
        && finiteValue(detail, 'historianFailureCount') !== null;
      detailCapability = hasCurrentStatusFields ? 'available' : 'partial';
    } else if (result.body && isRecord(result.body)) detailCapability = 'partial';
  } catch {
    detailCapability = 'unavailable';
  }

  const sidebar = mapLiveSidebar(rawSidebar, detail);
  const requiredUsage = sidebar.usage.inputTokens !== null
    && sidebar.usage.contextLimit !== null
    && sidebar.usage.usagePercent !== null;
  const compositionValues = Object.values(sidebar.composition);
  const countValues = Object.values(sidebar.counts);
  const compositionCapability = compositionValues.every((value) => value !== null) ? 'available' : 'partial';
  const countsCapability = countValues.every((value) => value !== null) ? 'available' : 'partial';
  const transformCapability = sidebar.transform.hasLastError !== null && sidebar.transform.inProgress !== null
    && 'recompProgress' in rawSidebar
    && (rawSidebar.recompProgress === null || safeRecompProgress(rawSidebar.recompProgress) !== null)
    ? 'available'
    : 'partial';
  const validLastDreamerRunAt = rawSidebar.lastDreamerRunAt === null || finiteValue(rawSidebar, 'lastDreamerRunAt') !== null;
  const activityCapability = typeof rawSidebar.historianRunning === 'boolean'
    && 'lastDreamerRunAt' in rawSidebar
    && validLastDreamerRunAt
    && 'dreamerProgress' in rawSidebar
    ? 'available'
    : 'partial';
  const cacheCapability = sidebar.cache.ttlMs !== null || sidebar.cache.thresholdPercent !== null
    ? 'available'
    : 'partial';
  const state: SourceState = requiredUsage
    && discovery.state === 'ready'
    && detailCapability === 'available'
    && compositionCapability === 'available'
    && countsCapability === 'available'
    && activityCapability === 'available'
    && transformCapability === 'available'
    && cacheCapability === 'available'
    ? 'ready'
    : 'partial';
  return {
    status: status(state, now().toISOString(), [
      { id: 'rpc.discovery', state: discovery.sawUnsupportedRecord ? 'partial' : 'available' },
      { id: 'rpc.bearer-auth', state: 'available' },
      { id: 'rpc.sidebar-snapshot', state: requiredUsage ? 'available' : 'partial' },
      { id: 'rpc.sidebar-composition', state: compositionCapability },
      { id: 'rpc.sidebar-counts', state: countsCapability },
      { id: 'rpc.status-detail', state: detailCapability },
      { id: 'rpc.activity-status', state: activityCapability },
      { id: 'rpc.transform-status', state: transformCapability },
      { id: 'rpc.cache-status', state: cacheCapability },
    ]),
    sidebar,
  };
};

export const isAllowlistedRpcMethod = (method: string): method is RpcMethod =>
  (RPC_METHODS as readonly string[]).includes(method);
