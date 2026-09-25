import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import type { StreamEvent, ProviderStatus, SourceState, EventGapDto } from '../shared.js';

const MAX_BOOTSTRAP_BYTES = 256 * 1024;
const MAX_READ_BYTES = 64 * 1024;
const MAX_LINE_BYTES = 8 * 1024;
const MAX_RETAINED_EVENTS = 500;
const MAX_PAGE_EVENTS = 100;
const MAX_SEEN_EVENTS = 2_000;
const MAX_CURSORS = 256;
const CURSOR_TTL_MS = 10 * 60 * 1_000;
const LOG_FRESHNESS_MS = 10_000;

type ParsedEvent = Omit<StreamEvent, 'id'>;
type SequencedEvent = { sequence: number; event: StreamEvent };
type CursorState = { sequence: number; gapVersion: number; createdAt: number };
type GapRecord = { version: number; reason: EventGapDto };
type FetchResult = { state: SourceState; observedAt: string; events: StreamEvent[]; cursor: string | null; gaps: EventGapDto[]; retainedEvents: number };

const unknownStatus = (): ProviderStatus => ({
  source: 'magic-context-log',
  state: 'unknown',
  observedAt: null,
  freshness: 'unknown',
  ageMs: null,
  capabilities: [
    { id: 'log.incremental-tail', state: 'unavailable' },
    { id: 'log.metadata-parser', state: 'available' },
  ],
});

const logCategory = (message: string): ParsedEvent['category'] | null => {
  const lower = message.toLowerCase();
  if (lower.startsWith('rust pass:')) return 'transform';
  if (lower.includes('dreamer')) return 'dreamer';
  if (lower.includes('historian') || lower.includes('compart')) return 'historian';
  if (lower.includes('transform') || lower.includes('material')) return 'transform';
  if (lower.includes('cache') || lower.includes('tokens.input')) return 'cache';
  if (lower.includes('session.status') || lower.includes('stream') || lower.includes('receive')
    || lower.includes('complete') || lower.includes('event')) return 'stream';
  return null;
};

const parsedTime = (value: string | undefined): string | null => {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
};

const hasSupportedEnvelope = (line: string): boolean =>
  /^\[([^\]]+)\]\s*\[magic-context\](?:\[[^\]]+\])?/i.test(line)
  || /^\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+/i.test(line);

export const parseMagicContextLogLine = (line: string): ParsedEvent | null => {
  if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) return null;
  const legacy = line.match(/^\[([^\]]+)\]\s*\[magic-context\](?:\[[^\]]+\])?\s*(.*)$/i);
  const fleet = line.match(/^(\S+)\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+(.*)$/i);
  const time = legacy?.[1] ?? fleet?.[1];
  const message = legacy?.[2] ?? fleet?.[3];
  if (!message) return null;
  const category = logCategory(message);
  if (!category) return null;
  const numberIn = (name: string): number | null => {
    const match = message.match(new RegExp(`(?:${name})\\s*[=: ]\\s*(\\d{1,16})`, 'i'));
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isSafeInteger(value) ? value : null;
  };
  const level = fleet?.[2]?.toLowerCase();
  const normalizedLevel: ParsedEvent['level'] = level === 'trace' || level === 'debug' || level === 'warn' || level === 'error'
    ? level
    : 'info';
  return {
    at: parsedTime(time),
    level: normalizedLevel,
    category,
    inputTokens: numberIn('tokens(?:\\.input| input)') ?? (message.toLowerCase().startsWith('rust pass:') ? numberIn('\\bin') : null),
    cacheRead: numberIn('cache(?:\\.read| read)'),
    cacheWrite: numberIn('cache(?:\\.write| write)'),
  };
};

const eventId = (event: ParsedEvent): string => createHash('sha256').update(JSON.stringify(event)).digest('hex');

export class MagicContextLogTailProvider {
  private readonly filePath: string;
  private identity: string | null = null;
  private offset = 0;
  private partialLine = Buffer.alloc(0);
  private discardUntilNewline = false;
  private initialized = false;
  private sequence = 0;
  private retained: SequencedEvent[] = [];
  private readonly seen = new Map<string, number>();
  private readonly cursors = new Map<string, CursorState>();
  private readonly gapHistory: GapRecord[] = [];
  private gapVersion = 0;
  private sourceState: SourceState = 'unknown';
  private observedAt: string | null = null;
  private lastGoodAt: number | null = null;
  private nonEmptyLines = 0;
  private supportedEnvelopeSeen = false;
  private formatGapRecorded = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  status(now = Date.now()): ProviderStatus {
    const ageMs = this.lastGoodAt === null ? null : Math.max(0, now - this.lastGoodAt);
    const freshness = this.lastGoodAt === null
      ? 'unknown'
      : (this.sourceState === 'ready' || this.sourceState === 'partial') && ageMs !== null && ageMs <= LOG_FRESHNESS_MS
        ? 'fresh'
        : 'stale';
    return {
      source: 'magic-context-log',
      state: this.sourceState,
      observedAt: this.observedAt,
      freshness,
      ageMs,
      capabilities: [
        { id: 'log.incremental-tail', state: this.sourceState === 'ready' || this.sourceState === 'partial' ? 'available' : 'unavailable' },
        { id: 'log.metadata-parser', state: this.sourceState === 'partial' ? 'partial' : this.sourceState === 'ready' ? 'available' : 'unavailable' },
      ],
    };
  }

  async poll(cursor: string | null, now = Date.now()): Promise<FetchResult> {
    await this.scan(now);
    this.expireCursors(now);

    const gaps = new Set<EventGapDto>();
    let afterSequence: number;
    let priorGapVersion = 0;
    if (cursor === null) {
      const first = this.retained[0]?.sequence ?? this.sequence + 1;
      afterSequence = Math.max(first - 1, this.sequence - MAX_PAGE_EVENTS);
    } else {
      const state = this.cursors.get(cursor);
      if (!state) {
        gaps.add('cursor-expired');
        afterSequence = Math.max((this.retained[0]?.sequence ?? this.sequence + 1) - 1, this.sequence - MAX_PAGE_EVENTS);
      } else {
        afterSequence = state.sequence;
        priorGapVersion = state.gapVersion;
        this.cursors.delete(cursor);
        if (this.retained.length && afterSequence < this.retained[0].sequence - 1) gaps.add('retention');
      }
    }

    for (const gap of this.gapHistory) {
      if (gap.version > priorGapVersion) gaps.add(gap.reason);
    }
    const page = this.retained.filter((entry) => entry.sequence > afterSequence).slice(0, MAX_PAGE_EVENTS);
    const nextSequence = page.length ? page[page.length - 1].sequence : this.sequence;
    const nextCursor = this.createCursor(nextSequence, now);
    const status = this.status(now);
    if (status.state === 'missing' || status.state === 'error' || status.state === 'unsupported') gaps.add('source-unavailable');

    return {
      state: status.state,
      observedAt: this.observedAt ?? new Date(now).toISOString(),
      events: page.map(({ event }) => event),
      cursor: nextCursor,
      gaps: [...gaps],
      retainedEvents: this.retained.length,
    };
  }

  private async scan(now: number): Promise<void> {
    const observedAt = new Date(now).toISOString();
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      handle = await fs.open(this.filePath, 'r');
      const info = await handle.stat();
      if (!info.isFile()) {
        this.setFailure('unsupported', observedAt, now);
        return;
      }
      const identity = `${info.dev}:${info.ino}`;
      const gaps = new Set<EventGapDto>();
      if (!this.initialized) {
        this.initialized = true;
        this.identity = identity;
        if (info.size > MAX_BOOTSTRAP_BYTES) {
          this.offset = info.size - MAX_BOOTSTRAP_BYTES;
          this.discardUntilNewline = true;
          gaps.add('initial-tail');
        }
      } else if (identity !== this.identity) {
        this.identity = identity;
        this.offset = 0;
        this.partialLine = Buffer.alloc(0);
        this.discardUntilNewline = false;
        this.nonEmptyLines = 0;
        this.supportedEnvelopeSeen = false;
        this.formatGapRecorded = false;
        gaps.add('rotation');
      } else if (info.size < this.offset) {
        this.offset = 0;
        this.partialLine = Buffer.alloc(0);
        this.discardUntilNewline = false;
        this.nonEmptyLines = 0;
        this.supportedEnvelopeSeen = false;
        this.formatGapRecorded = false;
        gaps.add('truncation');
      }

      const bytesToRead = Math.max(0, Math.min(MAX_READ_BYTES, info.size - this.offset));
      if (info.size - this.offset > MAX_READ_BYTES) gaps.add('backpressure');
      if (bytesToRead > 0) {
        const buffer = Buffer.alloc(bytesToRead);
        const { bytesRead } = await handle.read(buffer, 0, bytesToRead, this.offset);
        this.offset += bytesRead;
        this.consume(buffer.subarray(0, bytesRead), gaps);
      }
      if (this.nonEmptyLines > 0 && !this.supportedEnvelopeSeen && !this.formatGapRecorded) {
        gaps.add('format-unsupported');
        this.formatGapRecorded = true;
      }
      this.sourceState = this.nonEmptyLines > 0 && !this.supportedEnvelopeSeen ? 'partial' : 'ready';
      this.observedAt = observedAt;
      this.lastGoodAt = now;
      for (const gap of gaps) this.recordGap(gap);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const state: SourceState = code === 'ENOENT' ? 'missing' : 'error';
      const changed = this.sourceState !== state;
      this.sourceState = state;
      this.observedAt = observedAt;
      if (changed) this.recordGap('source-unavailable');
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  private consume(bytes: Buffer, gaps: Set<EventGapDto>): void {
    const combined = this.partialLine.length ? Buffer.concat([this.partialLine, bytes]) : bytes;
    this.partialLine = Buffer.alloc(0);
    let start = 0;
    while (start < combined.length) {
      const newline = combined.indexOf(0x0a, start);
      if (newline < 0) break;
      const line = combined.subarray(start, newline);
      start = newline + 1;
      if (this.discardUntilNewline) {
        this.discardUntilNewline = false;
        continue;
      }
      this.consumeLine(line, gaps);
    }
    const remaining = combined.subarray(start);
    if (this.discardUntilNewline) return;
    if (remaining.length > MAX_LINE_BYTES) {
      this.discardUntilNewline = true;
      gaps.add('backpressure');
      return;
    }
    this.partialLine = Buffer.from(remaining);
  }

  private consumeLine(bytes: Buffer, gaps: Set<EventGapDto>): void {
    const content = bytes.length && bytes[bytes.length - 1] === 0x0d ? bytes.subarray(0, -1) : bytes;
    if (content.length > MAX_LINE_BYTES) {
      gaps.add('backpressure');
      return;
    }
    const text = content.toString('utf8');
    if (text.trim()) this.nonEmptyLines += 1;
    if (hasSupportedEnvelope(text)) this.supportedEnvelopeSeen = true;
    const parsed = parseMagicContextLogLine(text);
    if (!parsed) return;
    const id = eventId(parsed);
    if (this.seen.has(id)) return;
    this.seen.set(id, this.sequence + 1);
    while (this.seen.size > MAX_SEEN_EVENTS) {
      const oldest = this.seen.keys().next().value;
      if (oldest) this.seen.delete(oldest);
      else break;
    }
    this.sequence += 1;
    this.retained.push({ sequence: this.sequence, event: { id, ...parsed } });
    if (this.retained.length > MAX_RETAINED_EVENTS) {
      this.retained.shift();
      gaps.add('retention');
    }
  }

  private recordGap(reason: EventGapDto): void {
    this.gapVersion += 1;
    this.gapHistory.push({ version: this.gapVersion, reason });
    if (this.gapHistory.length > 64) this.gapHistory.shift();
  }

  private createCursor(sequence: number, now: number): string {
    const cursor = randomBytes(18).toString('base64url');
    this.cursors.set(cursor, { sequence, gapVersion: this.gapVersion, createdAt: now });
    while (this.cursors.size > MAX_CURSORS) {
      const oldest = this.cursors.keys().next().value;
      if (oldest) this.cursors.delete(oldest);
      else break;
    }
    return cursor;
  }

  private expireCursors(now: number): void {
    for (const [cursor, state] of this.cursors) {
      if (now - state.createdAt > CURSOR_TTL_MS) this.cursors.delete(cursor);
    }
  }

  private setFailure(state: SourceState, observedAt: string, now: number): void {
    const changed = this.sourceState !== state;
    this.sourceState = state;
    this.observedAt = observedAt;
    if (changed) this.recordGap('source-unavailable');
    if (this.lastGoodAt !== null && now - this.lastGoodAt > CURSOR_TTL_MS * 24) {
      this.retained = [];
      this.sequence = 0;
      this.recordGap('retention');
    }
  }
}

export const unknownLogStatus = unknownStatus;
