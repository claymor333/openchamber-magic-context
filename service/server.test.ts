import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import http from 'node:http';
import os from 'node:os';
import { createExtensionService } from './server.js';
import { defaultDataPaths } from './config.js';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const freePort = async (): Promise<number> => {
  const probe = http.createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => resolve());
  });
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('No ephemeral port');
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
};

const listen = async (server: http.Server, port: number): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
};

describe('extension service route boundary', () => {
  test('requires the host service bearer token and exposes only fixed read-only routes', async () => {
    const port = await freePort();
    const token = 'service-secret-token';
    const server = createExtensionService({
      port,
      token,
      config: { paths: defaultDataPaths(os.tmpdir(), os.tmpdir()), state: 'invalid' },
    });
    servers.push(server);
    await listen(server, port);
    const base = `http://127.0.0.1:${port}`;

    const unauthorized = await fetch(`${base}/health`);
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json() as { error: string }).error, 'unauthorized');

    const headers = { Authorization: `Bearer ${token}` };
    const health = await fetch(`${base}/health`, { headers });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal(health.headers.get('access-control-allow-origin'), null);

    const arbitraryRpc = await fetch(`${base}/rpc/flush`, { headers });
    assert.equal(arbitraryRpc.status, 404);
    const arbitraryQuery = await fetch(`${base}/snapshot?rpcMethod=flush`, { headers });
    assert.equal(arbitraryQuery.status, 400);
    const arbitraryPath = await fetch(`${base}/snapshot?directory=${encodeURIComponent('https://example.test')}`, { headers });
    assert.equal(arbitraryPath.status, 400);
    const invalidSession = await fetch(`${base}/snapshot?sessionId=${encodeURIComponent('not a session')}`, { headers });
    assert.equal(invalidSession.status, 400);

    const snapshotResponse = await fetch(`${base}/snapshot`, { headers });
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await snapshotResponse.json() as { schemaVersion: number; sources: { magicContextDatabase: { state: string } }; database: unknown };
    assert.equal(snapshot.schemaVersion, 2);
    assert.equal(snapshot.sources.magicContextDatabase.state, 'error');
    assert.deepEqual(snapshot.database, {
      magicContext: { counts: null, context: null },
      openCode: { lastInputTokens: null, cacheEvents: [] },
    });
    assert.equal(JSON.stringify(snapshot).includes(token), false);

    const events = await fetch(`${base}/events?cursor=AAAAAAAAAAAAAAAAAAAAAAAA`, { headers });
    assert.equal(events.status, 200);
    const eventPage = await events.json() as { schemaVersion: number; source: { state: string }; gaps: string[] };
    assert.equal(eventPage.schemaVersion, 1);
    assert.equal(eventPage.source.state, 'error');
    assert.deepEqual(eventPage.gaps, ['source-unavailable']);
  });
});
