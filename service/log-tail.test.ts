import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MagicContextLogTailProvider, parseMagicContextLogLine } from './log-tail.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const temporaryLog = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'magic-context-log-'));
  roots.push(root);
  return path.join(root, 'magic-context.log');
};

const line = (at: string, message: string): string => `${at} INFO magic-context: ${message}`;

describe('bounded incremental Magic Context log provider', () => {
  test('parses only allowlisted metadata and never returns raw log text', async () => {
    const filePath = await temporaryLog();
    const secret = 'private prompt text never forwarded';
    await fs.writeFile(filePath, `${line('2026-09-26T12:00:00.000Z', `transform cache.read=100 cache.write=5 tokens.input=20 ${secret}`)}\n`);
    const provider = new MagicContextLogTailProvider(filePath);
    const page = await provider.poll(null);
    assert.equal(page.state, 'ready');
    assert.equal(page.events.length, 1);
    assert.equal(page.events[0].category, 'transform');
    assert.equal(page.events[0].inputTokens, 20);
    assert.equal(page.events[0].cacheRead, 100);
    assert.equal(JSON.stringify(page).includes(secret), false);
    assert.match(page.events[0].id, /^[a-f0-9]{64}$/);
    assert.equal(parseMagicContextLogLine(`[2026-09-26T12:00:00Z] [magic-context][session-x] historian completed ${secret}`)?.category, 'historian');
    const rustPass = parseMagicContextLogLine(
      `[2026-09-26T12:00:01Z] [magic-context][session-x] rust pass: decision=HARD reason=first_render in=4 out=3 private_path=/secret`,
    );
    assert.equal(rustPass?.category, 'transform');
    assert.equal(rustPass?.inputTokens, 4);
    assert.equal(JSON.stringify(rustPass).includes('/secret'), false);
  });

  test('uses opaque cursors, avoids duplicate events, and returns only new deltas', async () => {
    const filePath = await temporaryLog();
    const firstLine = line('2026-09-26T12:01:00.000Z', 'transform pass tokens.input=13');
    await fs.writeFile(filePath, `${firstLine}\n`);
    const provider = new MagicContextLogTailProvider(filePath);
    const first = await provider.poll(null);
    assert.equal(first.events.length, 1);
    assert.match(first.cursor ?? '', /^[A-Za-z0-9_-]{24}$/);

    const idle = await provider.poll(first.cursor);
    assert.equal(idle.events.length, 0);
    assert.notEqual(idle.cursor, first.cursor);

    await fs.appendFile(filePath, `${firstLine}\n${line('2026-09-26T12:01:01.000Z', 'cache.read=44 tokens.input=22')}\n`);
    const delta = await provider.poll(idle.cursor);
    assert.equal(delta.events.length, 1);
    assert.equal(delta.events[0].category, 'cache');
  });

  test('holds incomplete lines and reports rotation, truncation, and cursor expiry', async () => {
    const filePath = await temporaryLog();
    const provider = new MagicContextLogTailProvider(filePath);
    await fs.writeFile(filePath, line('2026-09-26T12:02:00.000Z', 'historian pass tokens.input=7'));
    const partial = await provider.poll(null);
    assert.equal(partial.events.length, 0);

    await fs.appendFile(filePath, '\n');
    const completed = await provider.poll(partial.cursor);
    assert.equal(completed.events.length, 1);

    await fs.rename(filePath, `${filePath}.1`);
    await fs.writeFile(filePath, `${line('2026-09-26T12:02:01.000Z', 'dreamer run cache.read=3')}\n`);
    const rotated = await provider.poll(completed.cursor);
    assert.ok(rotated.gaps.includes('rotation'));
    assert.equal(rotated.events.length, 1);

    await fs.writeFile(filePath, `${line('2026-09-26T12:02:02.000Z', 'cache.read=4')}\n`);
    const truncated = await provider.poll(rotated.cursor);
    assert.ok(truncated.gaps.includes('truncation'));
    assert.equal(truncated.events.length, 1);

    const restartedProvider = new MagicContextLogTailProvider(filePath);
    const restarted = await restartedProvider.poll(truncated.cursor);
    assert.ok(restarted.gaps.includes('cursor-expired'));
    assert.ok(restarted.events.length > 0);
  });

  test('bounds retention and reports backpressure when the log tail is larger than a poll', async () => {
    const filePath = await temporaryLog();
    const rows = Array.from({ length: 1_500 }, (_, index) => line(
      new Date(Date.UTC(2026, 8, 26, 12, 0, index)).toISOString(),
      `transform pass-${index} tokens.input=${index + 1}`,
    ));
    await fs.writeFile(filePath, `${rows.join('\n')}\n`);
    const provider = new MagicContextLogTailProvider(filePath);
    const page = await provider.poll(null);
    assert.ok(page.retainedEvents <= 500);
    assert.ok(page.events.length <= 100);
    assert.ok(page.gaps.includes('retention'));
    assert.ok(page.gaps.includes('backpressure'));
  });

  test('preserves bounded last-known events and marks the source stale when the log disappears', async () => {
    const filePath = await temporaryLog();
    await fs.writeFile(filePath, `${line('2026-09-26T12:03:00.000Z', 'cache.write=1 tokens.input=2')}\n`);
    const provider = new MagicContextLogTailProvider(filePath);
    const initial = await provider.poll(null);
    assert.equal(provider.status().freshness, 'fresh');
    assert.equal(provider.status(Date.now() + 11_000).freshness, 'stale');
    await fs.unlink(filePath);
    const missing = await provider.poll(initial.cursor);
    assert.equal(missing.state, 'missing');
    assert.equal(provider.status().freshness, 'stale');
    assert.ok(missing.gaps.includes('source-unavailable'));
    assert.equal(missing.retainedEvents, 1);
  });

  test('marks unrecognized log formats partial instead of returning authoritative empty events', async () => {
    const filePath = await temporaryLog();
    await fs.writeFile(filePath, 'new-log-format-with-unclassified-fields=1\n');
    const provider = new MagicContextLogTailProvider(filePath);
    const page = await provider.poll(null);
    assert.equal(page.state, 'partial');
    assert.equal(page.events.length, 0);
    assert.ok(page.gaps.includes('format-unsupported'));
    assert.equal(provider.status().capabilities.find(({ id }) => id === 'log.metadata-parser')?.state, 'partial');
  });
});
