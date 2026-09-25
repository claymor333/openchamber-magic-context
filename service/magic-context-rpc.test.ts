import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverRpcEndpoint, isAllowlistedRpcMethod, projectHash, readLiveSidebar } from './magic-context-rpc.js';

const roots: string[] = [];
const directory = path.join(path.sep, 'projects', 'fixture');
const token = 'a'.repeat(64);
const pid = 42_001;
const instanceId = '0123456789abcdef';

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const temporaryRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'magic-context-rpc-'));
  roots.push(root);
  return root;
};

const writeRecord = async (storageDir: string, values: Record<string, unknown> = {}): Promise<void> => {
  const discoveryDir = path.join(storageDir, 'rpc', projectHash(directory));
  await fs.mkdir(discoveryDir, { recursive: true });
  const record = { port: 47_321, pid, started_at: 1_800_000_000_000, token, instance_id: instanceId, ...values };
  const suffix = typeof record.instance_id === 'string' ? `-${record.instance_id}` : '';
  await fs.writeFile(path.join(discoveryDir, `port-${pid}${suffix}.json`), JSON.stringify(record));
};

const fetcherFor = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  async (input: string | URL, init?: RequestInit): Promise<Response> => handler(String(input), init);

const validSnapshot = (sessionId: string): Record<string, unknown> => ({
  sessionId,
  usagePercentage: 41.5,
  inputTokens: 41_500,
  contextLimit: 100_000,
  systemPromptTokens: 1_000,
  compartmentCount: 3,
  memoryCount: 4,
  memoryBlockCount: 2,
  pendingOpsCount: 1,
  historianRunning: false,
  compartmentInProgress: false,
  sessionNoteCount: 2,
  readySmartNoteCount: 1,
  cacheTtl: '5m',
  lastTransformError: 'private prompt-like error text',
  lastDreamerRunAt: null,
  compartmentTokens: 2_000,
  factTokens: 400,
  memoryTokens: 700,
  docsTokens: 150,
  profileTokens: 90,
  conversationTokens: 25_000,
  toolCallTokens: 8_000,
  toolDefinitionTokens: 3_000,
  executeThreshold: 65,
  recompProgress: { phase: 'recomp', processedMessages: 2, totalMessages: 5, passCount: 1, compartmentsCreated: 1, message: 'raw diagnostic secret' },
  dreamerProgress: null,
});

const response = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

describe('Magic Context RPC discovery and compatibility adapter', () => {
  test('accepts a current discovery record only after matching health process and instance identity', async () => {
    const storageDir = await temporaryRoot();
    await writeRecord(storageDir);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await discoverRpcEndpoint({
      storageDir,
      directory,
      fetcher: fetcherFor((url, init) => {
        calls.push({ url, init });
        return response({ ok: true, pid, instance_id: instanceId });
      }),
    });
    assert.equal(result.state, 'ready');
    assert.equal(result.endpoint?.port, 47_321);
    assert.equal(result.endpoint?.token, token);
    assert.deepEqual(calls.map(({ url }) => url), ['http://127.0.0.1:47321/health']);
    assert.equal(calls[0].init?.headers, undefined);
  });

  test('rejects PID and instance mismatches and accepts the tested legacy PID-only health shape', async () => {
    const storageDir = await temporaryRoot();
    await writeRecord(storageDir);
    const pidMismatch = await discoverRpcEndpoint({
      storageDir,
      directory,
      fetcher: fetcherFor(() => response({ ok: true, pid: pid + 1, instance_id: instanceId })),
    });
    assert.equal(pidMismatch.endpoint, null);
    assert.equal(pidMismatch.sawIdentityMismatch, true);
    const mismatch = await discoverRpcEndpoint({
      storageDir,
      directory,
      fetcher: fetcherFor(() => response({ ok: true, pid, instance_id: 'ffffffffffffffff' })),
    });
    assert.equal(mismatch.endpoint, null);
    assert.equal(mismatch.sawIdentityMismatch, true);
    const legacyStorage = path.join(storageDir, 'legacy');
    await writeRecord(legacyStorage, { instance_id: undefined });
    const legacy = await discoverRpcEndpoint({
      storageDir: legacyStorage,
      directory,
      fetcher: fetcherFor(() => response({ ok: true, pid })),
    });
    assert.equal(legacy.state, 'ready');
    assert.equal(legacy.endpoint?.instance_id, undefined);
  });

  test('treats absent discovery and unauthenticated records as missing/unsupported, not empty success', async () => {
    const storageDir = await temporaryRoot();
    assert.equal((await discoverRpcEndpoint({ storageDir, directory, fetcher: fetcherFor(() => response({ ok: true, pid })) })).state, 'missing');
    await writeRecord(storageDir, { token: undefined });
    const unsupported = await discoverRpcEndpoint({ storageDir, directory, fetcher: fetcherFor(() => response({ ok: true, pid })) });
    assert.equal(unsupported.endpoint, null);
    assert.equal(unsupported.state, 'unsupported');
  });

  test('bounds project discovery candidates and marks a truncated candidate set partial', async () => {
    const storageDir = await temporaryRoot();
    const discoveryDir = path.join(storageDir, 'rpc', projectHash(directory));
    await fs.mkdir(discoveryDir, { recursive: true });
    const record = JSON.stringify({ port: 47_321, pid, started_at: 1, token, instance_id: instanceId });
    await Promise.all(Array.from({ length: 65 }, (_, index) => fs.writeFile(
      path.join(discoveryDir, `port-${pid}-${index}.json`),
      record,
    )));
    const result = await discoverRpcEndpoint({
      storageDir,
      directory,
      fetcher: fetcherFor(() => response({ ok: true, pid, instance_id: instanceId })),
    });
    assert.equal(result.endpoint?.port, 47_321);
    assert.equal(result.state, 'partial');
    assert.equal(result.sawUnsupportedRecord, true);
  });

  test('calls only allowlisted routes with the secret token and emits only normalized metadata', async () => {
    const storageDir = await temporaryRoot();
    await writeRecord(storageDir);
    const rpcCalls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await readLiveSidebar({
      storageDir,
      directory,
      sessionId: 'session_1',
      now: () => new Date('2026-09-26T12:00:00.000Z'),
      fetcher: fetcherFor((url, init) => {
        if (url.endsWith('/health')) return response({ ok: true, pid, instance_id: instanceId });
        rpcCalls.push({ url, init });
        if (url.endsWith('/rpc/sidebar-snapshot')) return response(validSnapshot('session_1'));
        if (url.endsWith('/rpc/status-detail')) return response({
          sessionId: 'session_1',
          cacheTtlMs: 300_000,
          cacheRemainingMs: 120_000,
          cacheExpired: false,
          historianFailureCount: 0,
          lastTransformError: 'another private diagnostic string',
          configReloadFailure: { path: '/private/path', message: 'secret' },
        });
        return response({}, 404);
      }),
    });
    assert.equal(result.status.state, 'ready');
    assert.deepEqual(rpcCalls.map(({ url }) => url), [
      'http://127.0.0.1:47321/rpc/sidebar-snapshot',
      'http://127.0.0.1:47321/rpc/status-detail',
    ]);
    for (const call of rpcCalls) {
      assert.equal((call.init?.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    }
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(token), false);
    assert.equal(serialized.includes('private prompt-like'), false);
    assert.equal(serialized.includes('raw diagnostic secret'), false);
    assert.equal(serialized.includes('/private/path'), false);
    assert.equal(result.sidebar?.transform.hasLastError, true);
    assert.deepEqual(result.sidebar?.transform.recomp, {
      kind: null,
      phase: 'recomp',
      processedMessages: 2,
      totalMessages: 5,
      passCount: 1,
      compartmentsCreated: 1,
    });
    assert.equal(isAllowlistedRpcMethod('sidebar-snapshot'), true);
    assert.equal(isAllowlistedRpcMethod('status-detail'), true);
    assert.equal(isAllowlistedRpcMethod('flush'), false);
    assert.equal(isAllowlistedRpcMethod('../../health'), false);
  });

  test('reports missing methods and changed response fields as partial or unsupported', async () => {
    const storageDir = await temporaryRoot();
    await writeRecord(storageDir);
    const unsupportedDetail = await readLiveSidebar({
      storageDir,
      directory,
      sessionId: 'session_2',
      fetcher: fetcherFor((url) => {
        if (url.endsWith('/health')) return response({ ok: true, pid, instance_id: instanceId });
        if (url.endsWith('/rpc/sidebar-snapshot')) return response({ ...validSnapshot('session_2'), conversationTokens: undefined });
        return response({ error: 'Unknown method' }, 404);
      }),
    });
    assert.equal(unsupportedDetail.status.state, 'partial');
    assert.equal(unsupportedDetail.status.capabilities.find(({ id }) => id === 'rpc.status-detail')?.state, 'unsupported');
    assert.equal(unsupportedDetail.sidebar?.composition.conversationTokens, null);
    const invalidShape = await readLiveSidebar({
      storageDir,
      directory,
      sessionId: 'session_2',
      fetcher: fetcherFor((url) => {
        if (url.endsWith('/health')) return response({ ok: true, pid, instance_id: instanceId });
        if (url.endsWith('/rpc/sidebar-snapshot')) return response({ sessionId: 'wrong-session', inputTokens: 'not-a-number' });
        return response({}, 404);
      }),
    });
    assert.equal(invalidShape.status.state, 'partial');
    assert.equal(invalidShape.sidebar, null);

    const detailShape = await readLiveSidebar({
      storageDir,
      directory,
      sessionId: 'session_2',
      fetcher: fetcherFor((url) => {
        if (url.endsWith('/health')) return response({ ok: true, pid, instance_id: instanceId });
        if (url.endsWith('/rpc/sidebar-snapshot')) return response(validSnapshot('session_2'));
        return response({ sessionId: 'session_2' });
      }),
    });
    assert.equal(detailShape.status.state, 'partial');
    assert.equal(detailShape.status.capabilities.find(({ id }) => id === 'rpc.status-detail')?.state, 'partial');
  });

  test('rejects URL-like, relative, NUL-containing, and oversized project locations', async () => {
    const storageDir = await temporaryRoot();
    for (const invalid of ['https://example.test', 'relative/path', '/safe/../secret', `/safe\0path`, `/${'x'.repeat(4_100)}`]) {
      const result = await discoverRpcEndpoint({ storageDir, directory: invalid, fetcher: fetcherFor(() => response({ ok: true, pid })) });
      assert.equal(result.state, 'error');
      assert.equal(result.endpoint, null);
    }
  });
});
