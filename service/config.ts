import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CONFIG_RELATIVE_PATH = path.join('.config', 'openchamber', 'extensions', 'openchamber-magic-context.json');
const MAX_CONFIG_BYTES = 16 * 1024;
const MAX_PATH_LENGTH = 4_096;

export type DataPaths = {
  magicContextStorageDir: string;
  magicContextDatabase: string;
  openCodeDatabase: string;
  magicContextLog: string;
};

export type ServiceConfig = {
  paths: DataPaths;
  state: 'default' | 'configured' | 'invalid';
};

type PathOverrides = {
  magicContextStorageDir?: string;
  openCodeDatabasePath?: string;
  magicContextLogPath?: string;
};

export const defaultDataPaths = (home = os.homedir(), temp = os.tmpdir()): DataPaths => {
  const magicContextStorageDir = path.join(home, '.local', 'share', 'cortexkit', 'magic-context');
  return {
    magicContextStorageDir,
    magicContextDatabase: path.join(magicContextStorageDir, 'context.db'),
    openCodeDatabase: path.join(home, '.local', 'share', 'opencode', 'opencode.db'),
    magicContextLog: path.join(temp, 'opencode', 'magic-context', 'magic-context.log'),
  };
};

export const configFilePath = (home = os.homedir()): string => path.join(home, CONFIG_RELATIVE_PATH);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validAbsolutePath = (value: unknown): value is string =>
  typeof value === 'string'
  && value.length > 0
  && value.length <= MAX_PATH_LENGTH
  && !value.includes('\0')
  && path.isAbsolute(value);

const parseOverrides = (value: unknown): PathOverrides | null => {
  if (!isRecord(value)) return null;
  const allowed = new Set(['magicContextStorageDir', 'openCodeDatabasePath', 'magicContextLogPath']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  const overrides: PathOverrides = {};
  for (const key of allowed) {
    const item = value[key];
    if (item === undefined) continue;
    if (!validAbsolutePath(item)) return null;
    if (key === 'magicContextStorageDir') overrides.magicContextStorageDir = path.resolve(item);
    if (key === 'openCodeDatabasePath') overrides.openCodeDatabasePath = path.resolve(item);
    if (key === 'magicContextLogPath') overrides.magicContextLogPath = path.resolve(item);
  }
  return overrides;
};

const readBoundedConfig = async (filePath: string): Promise<string | null> => {
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(filePath, 'r');
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_CONFIG_BYTES) return null;
    const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_CONFIG_BYTES) return null;
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle?.close().catch(() => undefined);
  }
};

export const resolveServiceConfig = async ({
  home = os.homedir(),
  temp = os.tmpdir(),
  filePath = configFilePath(home),
}: {
  home?: string;
  temp?: string;
  filePath?: string;
} = {}): Promise<ServiceConfig> => {
  const defaults = defaultDataPaths(home, temp);
  let text: string | null;
  try {
    text = await readBoundedConfig(filePath);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? { paths: defaults, state: 'default' }
      : { paths: defaults, state: 'invalid' };
  }
  if (text === null) return { paths: defaults, state: 'invalid' };

  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return { paths: defaults, state: 'invalid' };
  }
  const overrides = parseOverrides(decoded);
  if (!overrides) return { paths: defaults, state: 'invalid' };
  const magicContextStorageDir = overrides.magicContextStorageDir ?? defaults.magicContextStorageDir;
  return {
    paths: {
      magicContextStorageDir,
      magicContextDatabase: path.join(magicContextStorageDir, 'context.db'),
      openCodeDatabase: overrides.openCodeDatabasePath ?? defaults.openCodeDatabase,
      magicContextLog: overrides.magicContextLogPath ?? defaults.magicContextLog,
    },
    state: Object.keys(decoded as Record<string, unknown>).length ? 'configured' : 'default',
  };
};
