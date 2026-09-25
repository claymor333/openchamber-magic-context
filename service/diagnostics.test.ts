import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  buildSnapshot,
  emptyDatabaseDiagnostics,
  readDatabaseProviders,
  resolveDataPaths,
  type DataPaths,
} from './diagnostics.js';
import {
  parseDiagnosticsResponse,
  parseEventPage,
  preserveLastGoodEvents,
  type DiagnosticsResponse,
  type EventPageDto,
} from '../shared.js';

const roots: string[] = [];
type FixtureDatabasePaths = { magicContext: string; openCode: string };

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const temporaryRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'magic-context-extension-test-'));
  roots.push(root);
  return root;
};

const createDatabases = (root: string): FixtureDatabasePaths => {
  const magicContext = path.join(root, 'context.db');
  const contextDb = new DatabaseSync(magicContext);
  contextDb.exec(`
    CREATE TABLE session_meta (
      session_id TEXT, harness TEXT, last_input_tokens INTEGER,
      last_context_percentage REAL, last_usage_context_limit INTEGER
    );
    CREATE TABLE compartments (id TEXT, session_id TEXT);
    CREATE TABLE memories (id TEXT, session_id TEXT, deleted_at TEXT);
    CREATE TABLE pending_ops (id TEXT, session_id TEXT);
    CREATE TABLE notes (id TEXT, session_id TEXT);
    CREATE TABLE transform_decisions (
      session_id TEXT, harness TEXT, message_id TEXT, decision TEXT,
      materialize_reason TEXT, emergency INTEGER
    );
  `);
  contextDb.prepare('INSERT INTO session_meta VALUES (?, ?, ?, ?, ?)').run('ses_fixture', 'opencode', 210_000, 22.8, 922_000);
  contextDb.prepare('INSERT INTO compartments VALUES (?, ?)').run('compartment-1', 'ses_fixture');
  contextDb.prepare('INSERT INTO memories VALUES (?, ?, ?)').run('memory-1', 'ses_fixture', null);
  contextDb.prepare('INSERT INTO pending_ops VALUES (?, ?)').run('op-1', 'ses_fixture');
  contextDb.prepare('INSERT INTO notes VALUES (?, ?)').run('note-1', 'ses_fixture');
  contextDb.prepare('INSERT INTO transform_decisions VALUES (?, ?, ?, ?, ?, ?)')
    .run('ses_fixture', 'opencode', 'message-1', 'materialize', 'context threshold', 0);
  contextDb.close();

  const openCode = path.join(root, 'opencode.db');
  const openCodeDb = new DatabaseSync(openCode);
  openCodeDb.exec('CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT)');
  const data = JSON.stringify({
    role: 'assistant',
    tokens: { input: 300, cache: { read: 600, write: 100 }, total: 1_000 },
  });
  openCodeDb.prepare('INSERT INTO message VALUES (?, ?, ?, ?)').run('message-1', 'ses_fixture', Date.now(), data);
  openCodeDb.prepare('INSERT INTO message VALUES (?, ?, ?, ?)').run('message-other', 'ses_other', Date.now(), data);
  openCodeDb.close();
  return { magicContext, openCode };
};

const fixtureDataPaths = (root: string, databases: FixtureDatabasePaths): DataPaths => ({
  magicContextStorageDir: root,
  magicContextDatabase: databases.magicContext,
  openCodeDatabase: databases.openCode,
  magicContextLog: path.join(root, 'magic-context.log'),
});

const sourceStatus = (source: 'magic-context-log'): DiagnosticsResponse['sources']['logTail'] => ({
  source,
  state: 'unknown',
  observedAt: null,
  freshness: 'unknown',
  ageMs: null,
  capabilities: [
    { id: 'log.incremental-tail', state: 'unavailable' },
    { id: 'log.metadata-parser', state: 'available' },
  ],
});

describe('read-only database providers and normalized snapshots', () => {
  test('resolves established default data paths', () => {
    assert.deepEqual(resolveDataPaths('/home/test', '/tmp'), {
      magicContextStorageDir: '/home/test/.local/share/cortexkit/magic-context',
      magicContextDatabase: '/home/test/.local/share/cortexkit/magic-context/context.db',
      openCodeDatabase: '/home/test/.local/share/opencode/opencode.db',
      magicContextLog: '/tmp/opencode/magic-context/magic-context.log',
    });
  });

  test('returns session-scoped token usage, durable counts, and normalized transform causes read-only', async () => {
    const root = await temporaryRoot();
    const databases = createDatabases(root);
    const result = await readDatabaseProviders({ sessionId: 'ses_fixture', paths: fixtureDataPaths(root, databases) });
    assert.deepEqual(result.database.magicContext, {
      counts: { compartments: 1, memories: 1, pendingOps: 1, sessionNotes: 1 },
      context: { inputTokens: 210_000, contextLimit: 922_000, usagePercent: 22.8 },
    });
    assert.equal(result.database.openCode.lastInputTokens, 300);
    assert.equal(result.database.openCode.cacheEvents.length, 1);
    const cacheEvent = result.database.openCode.cacheEvents[0];
    assert.ok(cacheEvent?.at && Number.isFinite(Date.parse(cacheEvent.at)));
    assert.deepEqual({
      inputTokens: cacheEvent?.inputTokens,
      cacheRead: cacheEvent?.cacheRead,
      cacheWrite: cacheEvent?.cacheWrite,
      totalTokens: cacheEvent?.totalTokens,
      hitRatio: cacheEvent?.hitRatio,
      cause: cacheEvent?.cause,
    }, {
      inputTokens: 300, cacheRead: 600, cacheWrite: 100, totalTokens: 1_000, hitRatio: 2 / 3, cause: 'materialized',
    });
    assert.equal(result.magicContextStatus.state, 'ready');
    assert.equal(result.openCodeStatus.state, 'ready');

    const verifyContext = new DatabaseSync(databases.magicContext, { readOnly: true });
    assert.equal(verifyContext.prepare('SELECT COUNT(*) AS count FROM memories').get()?.count, 1);
    assert.throws(() => verifyContext.exec('DELETE FROM memories'));
    verifyContext.close();
    const verifyOpenCode = new DatabaseSync(databases.openCode, { readOnly: true });
    assert.equal(verifyOpenCode.prepare('SELECT COUNT(*) AS count FROM message WHERE session_id = ?').get('ses_fixture')?.count, 1);
    assert.throws(() => verifyOpenCode.exec('DELETE FROM message'));
    verifyOpenCode.close();
  });

  test('does not return other sessions cache events when no session is selected', async () => {
    const root = await temporaryRoot();
    const databases = createDatabases(root);
    const result = await readDatabaseProviders({ sessionId: null, paths: fixtureDataPaths(root, databases) });
    assert.deepEqual(result.database.openCode.cacheEvents, []);
    assert.equal(result.database.openCode.lastInputTokens, null);
    assert.equal(result.openCodeStatus.state, 'partial');
  });

  test('marks assistant rows without recognized usage fields partial instead of empty success', async () => {
    const root = await temporaryRoot();
    const magicContext = path.join(root, 'context.db');
    const openCode = path.join(root, 'opencode.db');
    new DatabaseSync(magicContext).close();
    const db = new DatabaseSync(openCode);
    db.exec('CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT)');
    db.prepare('INSERT INTO message VALUES (?, ?, ?, ?)')
      .run('assistant-1', 'ses_fixture', Date.now(), JSON.stringify({ role: 'assistant', text: 'not returned' }));
    db.close();
    const result = await readDatabaseProviders({
      sessionId: 'ses_fixture',
      paths: fixtureDataPaths(root, { magicContext, openCode }),
    });
    assert.equal(result.openCodeStatus.state, 'partial');
    assert.equal(result.openCodeStatus.capabilities[0].state, 'partial');
    assert.deepEqual(result.database.openCode.cacheEvents, []);
  });

  test('reports missing files and unsupported schemas instead of an authoritative empty snapshot', async () => {
    const root = await temporaryRoot();
    const missingPaths: DataPaths = {
      magicContextStorageDir: root,
      magicContextDatabase: path.join(root, 'missing-context.db'),
      openCodeDatabase: path.join(root, 'missing-opencode.db'),
      magicContextLog: path.join(root, 'missing.log'),
    };
    const missing = await readDatabaseProviders({ sessionId: null, paths: missingPaths });
    assert.equal(missing.magicContextStatus.state, 'missing');
    assert.equal(missing.openCodeStatus.state, 'missing');
    assert.deepEqual(missing.database, emptyDatabaseDiagnostics());

    const context = path.join(root, 'unknown-context.db');
    const openCode = path.join(root, 'unknown-opencode.db');
    new DatabaseSync(context).close();
    new DatabaseSync(openCode).close();
    const unknown = await readDatabaseProviders({
      sessionId: null,
      paths: { ...missingPaths, magicContextDatabase: context, openCodeDatabase: openCode },
    });
    assert.equal(unknown.magicContextStatus.state, 'partial');
    assert.equal(unknown.openCodeStatus.state, 'partial');
  });

  test('reports runtimes without SQLite as unsupported without touching database paths', async () => {
    const root = await temporaryRoot();
    const paths: DataPaths = {
      magicContextStorageDir: root,
      magicContextDatabase: path.join(root, 'unread-context.db'),
      openCodeDatabase: path.join(root, 'unread-opencode.db'),
      magicContextLog: path.join(root, 'unused.log'),
    };
    const result = await readDatabaseProviders({ sessionId: 'ses_fixture', paths, sqlite: null });
    assert.equal(result.magicContextStatus.state, 'unsupported');
    assert.equal(result.openCodeStatus.state, 'unsupported');
    assert.equal(result.magicContextStatus.capabilities[0].state, 'unsupported');
    assert.deepEqual(result.database, emptyDatabaseDiagnostics());
    await assert.rejects(fs.stat(paths.magicContextDatabase), { code: 'ENOENT' });
  });

  test('marks malformed server configuration unavailable rather than using default files', async () => {
    const root = await temporaryRoot();
    const snapshot = await buildSnapshot({
      sessionId: null,
      directory: null,
      paths: {
        magicContextStorageDir: root,
        magicContextDatabase: path.join(root, 'never-read.db'),
        openCodeDatabase: path.join(root, 'never-read-opencode.db'),
        magicContextLog: path.join(root, 'never-read.log'),
      },
      logStatus: sourceStatus('magic-context-log'),
      configurationValid: false,
    });
    assert.equal(snapshot.sources.liveRpc.state, 'error');
    assert.equal(snapshot.sources.magicContextDatabase.state, 'error');
    assert.equal(snapshot.sources.openCodeDatabase.state, 'error');
    assert.equal(snapshot.liveSidebar, null);
    assert.deepEqual(snapshot.database, emptyDatabaseDiagnostics());
    assert.equal(parseDiagnosticsResponse(JSON.stringify(snapshot))?.schemaVersion, 2);
    assert.equal(parseDiagnosticsResponse(JSON.stringify({ ...snapshot, schemaVersion: 1 })), null);
  });

  test('validates event pages and preserves previous events with explicit stale state on failure', () => {
    const previous: EventPageDto = {
      schemaVersion: 1,
      observedAt: '2026-09-26T12:00:00.000Z',
      source: {
        source: 'magic-context-log', state: 'ready', observedAt: '2026-09-26T12:00:00.000Z', freshness: 'fresh', ageMs: 0,
        capabilities: [{ id: 'log.incremental-tail', state: 'available' }, { id: 'log.metadata-parser', state: 'available' }],
      },
      cursor: 'AAAAAAAAAAAAAAAAAAAAAAAA',
      events: [{ id: 'event-1', at: null, level: 'info', category: 'transform', inputTokens: null, cacheRead: null, cacheWrite: null }],
      gaps: [],
      retainedEvents: 1,
    };
    const failed: EventPageDto = {
      ...previous,
      observedAt: '2026-09-26T12:00:05.000Z',
      source: { ...previous.source, state: 'error', freshness: 'unknown' },
      events: [],
      gaps: ['source-unavailable'],
    };
    const parsed = parseEventPage(JSON.stringify(previous));
    assert.deepEqual(parsed, previous);
    const retained = preserveLastGoodEvents(previous, failed);
    assert.equal(retained.events.length, 1);
    assert.equal(retained.source.freshness, 'stale');
  });
});
