import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { EventGapDto, EventPageDto, ProviderStatus } from '../shared.js';
import { buildSnapshot } from './diagnostics.js';
import type { ServiceConfig } from './config.js';
import { MagicContextLogTailProvider } from './log-tail.js';
import { validateProjectDirectory, validateSessionId } from './magic-context-rpc.js';

const MAX_URL_LENGTH = 8_192;
const MAX_ACTIVE_REQUESTS = 8;

type ServiceError = { error: 'unauthorized' | 'not-found' | 'invalid-request' | 'service-busy' | 'diagnostics-unavailable' };
type ServiceBody = { ok: true } | ServiceError | Awaited<ReturnType<typeof buildSnapshot>> | EventPageDto;

const reply = (response: http.ServerResponse, status: number, body: ServiceBody): void => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
};

const isAuthorized = (header: string | undefined, token: string): boolean => {
  if (!header?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

const onlyQueryKeys = (url: URL, allowed: readonly string[]): boolean => {
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) return false;
  }
  return true;
};

const emptyLogStatus = (state: ProviderStatus['state'], observedAt: string): ProviderStatus => ({
  source: 'magic-context-log',
  state,
  observedAt,
  freshness: 'unknown',
  ageMs: null,
  capabilities: [
    { id: 'log.incremental-tail', state: 'unavailable' },
    { id: 'log.metadata-parser', state: 'available' },
  ],
});

const invalidConfigEventPage = (observedAt: string): EventPageDto => ({
  schemaVersion: 1,
  observedAt,
  source: emptyLogStatus('error', observedAt),
  cursor: null,
  events: [],
  gaps: ['source-unavailable'],
  retainedEvents: 0,
});

export const createExtensionService = ({
  port,
  token,
  config,
  logProvider,
}: {
  port: number;
  token: string;
  config: ServiceConfig;
  logProvider?: MagicContextLogTailProvider | null;
}): http.Server => {
  if (!Number.isInteger(port) || port < 1 || port > 65_535 || !token) {
    throw new Error('OpenChamber service port and token are required');
  }
  const logTail = logProvider === undefined
    ? config.state === 'invalid' ? null : new MagicContextLogTailProvider(config.paths.magicContextLog)
    : logProvider;
  let activeRequests = 0;

  return http.createServer((request, response) => {
    if (!isAuthorized(request.headers.authorization, token)) {
      reply(response, 401, { error: 'unauthorized' });
      return;
    }
    if (activeRequests >= MAX_ACTIVE_REQUESTS) {
      reply(response, 429, { error: 'service-busy' });
      return;
    }
    if (request.method !== 'GET' || typeof request.url !== 'string' || request.url.length > MAX_URL_LENGTH) {
      reply(response, 404, { error: 'not-found' });
      return;
    }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/health' && onlyQueryKeys(url, [])) {
      reply(response, 200, { ok: true });
      return;
    }

    if (url.pathname === '/snapshot') {
      if (!onlyQueryKeys(url, ['directory', 'sessionId'])) {
        reply(response, 400, { error: 'invalid-request' });
        return;
      }
      const directoryValue = url.searchParams.get('directory');
      const directory = directoryValue === null || directoryValue === '' ? null : directoryValue;
      if (directory !== null && !validateProjectDirectory(directory)) {
        reply(response, 400, { error: 'invalid-request' });
        return;
      }
      const sessionValue = url.searchParams.get('sessionId');
      const sessionId = sessionValue === null || sessionValue === '' ? null : sessionValue;
      if (sessionId !== null && !validateSessionId(sessionId)) {
        reply(response, 400, { error: 'invalid-request' });
        return;
      }
      activeRequests += 1;
      void buildSnapshot({
        sessionId,
        directory,
        paths: config.paths,
        logStatus: logTail?.status() ?? emptyLogStatus(config.state === 'invalid' ? 'error' : 'unknown', new Date().toISOString()),
        configurationValid: config.state !== 'invalid',
      }).then((snapshot) => reply(response, 200, snapshot)).catch(() => {
        reply(response, 500, { error: 'diagnostics-unavailable' });
      }).finally(() => {
        activeRequests -= 1;
      });
      return;
    }

    if (url.pathname === '/events') {
      if (!onlyQueryKeys(url, ['cursor'])) {
        reply(response, 400, { error: 'invalid-request' });
        return;
      }
      const cursorValue = url.searchParams.get('cursor');
      if (cursorValue !== null && !/^[A-Za-z0-9_-]{24}$/.test(cursorValue)) {
        reply(response, 400, { error: 'invalid-request' });
        return;
      }
      if (!logTail) {
        reply(response, 200, invalidConfigEventPage(new Date().toISOString()));
        return;
      }
      activeRequests += 1;
      void logTail.poll(cursorValue).then((page) => {
        const body: EventPageDto = {
          schemaVersion: 1,
          observedAt: page.observedAt,
          source: logTail.status(),
          cursor: page.cursor,
          events: page.events,
          gaps: page.gaps,
          retainedEvents: page.retainedEvents,
        };
        reply(response, 200, body);
      }).catch(() => {
        const observedAt = new Date().toISOString();
        const gaps: EventGapDto[] = ['source-unavailable'];
        reply(response, 200, {
          schemaVersion: 1,
          observedAt,
          source: emptyLogStatus('error', observedAt),
          cursor: cursorValue,
          events: [],
          gaps,
          retainedEvents: 0,
        });
      }).finally(() => {
        activeRequests -= 1;
      });
      return;
    }

    reply(response, 404, { error: 'not-found' });
  });
};
