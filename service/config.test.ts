import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configFilePath, defaultDataPaths, resolveServiceConfig } from './config.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const temporaryHome = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'magic-context-config-'));
  roots.push(root);
  return root;
};

describe('extension service configuration', () => {
  test('uses documented same-user defaults and a fixed config file location', async () => {
    const home = await temporaryHome();
    const temp = path.join(home, 'tmp');
    const result = await resolveServiceConfig({ home, temp });
    assert.deepEqual(result, { paths: defaultDataPaths(home, temp), state: 'default' });
    assert.equal(configFilePath(home), path.join(home, '.config', 'openchamber', 'extensions', 'openchamber-magic-context.json'));
    assert.deepEqual(result.paths, {
      magicContextStorageDir: path.join(home, '.local', 'share', 'cortexkit', 'magic-context'),
      magicContextDatabase: path.join(home, '.local', 'share', 'cortexkit', 'magic-context', 'context.db'),
      openCodeDatabase: path.join(home, '.local', 'share', 'opencode', 'opencode.db'),
      magicContextLog: path.join(temp, 'opencode', 'magic-context', 'magic-context.log'),
    });
  });

  test('applies only absolute path overrides from the fixed server-side file', async () => {
    const home = await temporaryHome();
    const filePath = path.join(home, 'extension-config.json');
    await fs.writeFile(filePath, JSON.stringify({
      magicContextStorageDir: path.join(home, 'custom', 'mc'),
      openCodeDatabasePath: path.join(home, 'custom', 'opencode.db'),
      magicContextLogPath: path.join(home, 'custom', 'mc.log'),
    }));
    const result = await resolveServiceConfig({ home, temp: path.join(home, 'tmp'), filePath });
    assert.equal(result.state, 'configured');
    assert.equal(result.paths.magicContextStorageDir, path.join(home, 'custom', 'mc'));
    assert.equal(result.paths.magicContextDatabase, path.join(home, 'custom', 'mc', 'context.db'));
    assert.equal(result.paths.openCodeDatabase, path.join(home, 'custom', 'opencode.db'));
    assert.equal(result.paths.magicContextLog, path.join(home, 'custom', 'mc.log'));
  });

  test('rejects relative, oversized, unknown, and malformed configuration rather than silently using defaults', async () => {
    const home = await temporaryHome();
    const filePath = path.join(home, 'extension-config.json');
    for (const text of [
      JSON.stringify({ openCodeDatabasePath: '../other.db' }),
      JSON.stringify({ extraPath: '/tmp/secret' }),
      '{broken',
    ]) {
      await fs.writeFile(filePath, text);
      assert.equal((await resolveServiceConfig({ home, filePath })).state, 'invalid');
    }
    await fs.writeFile(filePath, ' '.repeat(16 * 1024 + 1));
    assert.equal((await resolveServiceConfig({ home, filePath })).state, 'invalid');
  });
});
