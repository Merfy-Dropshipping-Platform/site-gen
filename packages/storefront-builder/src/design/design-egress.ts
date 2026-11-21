import { createServer, connect as tcpConnect, type AddressInfo, type Server, type Socket } from 'node:net';
import { AddressRefused, type DesignGuard, type Target } from './design-guard';

// Прокси внутри проверяющего процесса: через него, и только через него, ходит Chromium «Дизайна по ссылке» (флаги
// `--proxy-server` и `--proxy-bypass-list=<-loopback>`, `design-browser.ts`). Выход в сеть режет не перехват запросов в
// странице (он не видит второй шаг редиректа и повторное разрешение имени), а сам прокси: на каждое соединение он
// разрешает имя, проверяет все адреса (`DesignGuard`) и соединяется с уже проверенным IP. Поэтому закрыты редиректы
// (каждый шаг — новый запрос к прокси), подзапросы, WebSocket (идёт через CONNECT или обычным HTTP с Upgrade) и подмена
// DNS между проверкой и соединением: Chromium имени не разрешает, прокси разрешает один раз. Образец — Визи
// `vizi/web/egress.py`.
//
// Слушает 127.0.0.1 на случайном порту. Понимает `CONNECT host:port` и обычный HTTP с адресом целиком в первой строке;
// запрос уходит с `Connection: close`, поэтому одно соединение — одна цель. Отказ — 403 с заголовком
// `X-Merfy-Egress: refused`, причина — в `refusals` (по ней захват отличает «адрес закрыт» от «сайт не отвечает»).

const HEAD_LIMIT = 64 * 1024;
const HEAD_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 60_000;
// Заголовки «прокси ↔ клиент»: дальше не идут, соединение закрывает сам прокси. Upgrade и Connection: Upgrade у
// WebSocket по обычному HTTP сохраняются — иначе рукопожатие не пройдёт.
const HOP_HEADERS = new Set(['proxy-connection', 'proxy-authorization', 'keep-alive']);
export const REFUSED_HEADER = 'x-merfy-egress';

export interface Refusal {
  host: string;
  port: number;
  reason: string;
  internal: boolean;
}

export interface ProxyRequest {
  method: string;
  host: string;
  port: number;
  // Для обычного HTTP — путь с запросом; для CONNECT пусто.
  path: string;
  headers: string[];
  tunnel: boolean;
}

export type Dial = (address: string, port: number) => Promise<Socket>;

export class BadRequest extends Error {}

// `host:443`, `[::1]:443`, `host` → имя и порт.
export function splitHostPort(target: string, fallback: number): { host: string; port: number } {
  const url = URL.canParse(`http://${target}`) ? new URL(`http://${target}`) : null;
  if (url === null || url.hostname === '') throw new BadRequest('адрес цели не разобран');
  const explicit = /:(\d+)$/.exec(target);
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: explicit?.[1] === undefined ? fallback : Number(explicit[1]),
  };
}

const keepHeader = (line: string): boolean =>
  line !== '' && !HOP_HEADERS.has((line.split(':', 1)[0] ?? '').trim().toLowerCase());

const upgrading = (headers: string[]): boolean => headers.some((line) => /^upgrade\s*:/i.test(line));

export function parseRequest(head: string): ProxyRequest {
  const [first = '', ...rest] = head.split('\r\n');
  const parts = first.split(' ');
  const [method = '', target = ''] = parts;
  if (parts.length !== 3) throw new BadRequest('первая строка запроса не разобрана');
  const headers = rest.filter(keepHeader).filter((line) => upgrading(rest) || !/^connection\s*:/i.test(line));
  if (method.toUpperCase() === 'CONNECT')
    return { method: 'CONNECT', ...splitHostPort(target, 443), path: '', headers, tunnel: true };
  const url = URL.canParse(target) ? new URL(target) : null;
  if (url === null || url.protocol !== 'http:') throw new BadRequest('прокси принимает CONNECT и http-адрес целиком');
  const port = url.port === '' ? 80 : Number(url.port);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  return { method, host, port, path: `${url.pathname}${url.search}`, headers, tunnel: false };
}

export function upstreamHead(request: ProxyRequest): string {
  const close = upgrading(request.headers) ? [] : ['Connection: close'];
  return [`${request.method} ${request.path} HTTP/1.1`, ...request.headers, ...close, '', ''].join('\r\n');
}

const REASONS: Record<number, string> = { 400: 'Bad Request', 403: 'Forbidden', 502: 'Bad Gateway' };

export function replyOf(status: number, text: string): string {
  const body = Buffer.from(text, 'utf8');
  const refused = status === 403 ? [`X-Merfy-Egress: refused`] : [];
  return [
    `HTTP/1.1 ${status} ${REASONS[status] ?? 'Error'}`,
    'Content-Type: text/plain; charset=utf-8',
    `Content-Length: ${body.length}`,
    ...refused,
    'Connection: close',
    '',
    text,
  ].join('\r\n');
}

export const tcpDial: Dial = (address, port) =>
  new Promise((resolve, reject) => {
    const socket = tcpConnect({ host: address, port });
    const timer = setTimeout(() => socket.destroy(new Error('соединение не встало')), CONNECT_TIMEOUT_MS);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

// Голова запроса до пустой строки; что пришло после неё (тело, начало TLS) — остаток.
function readHead(socket: Socket): Promise<{ head: string; rest: Buffer }> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => finish(new BadRequest('запрос не прочитан')), HEAD_TIMEOUT_MS);
    const finish = (error: Error | null, value?: { head: string; rest: Buffer }): void => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('end', onEnd);
      if (error !== null || value === undefined) reject(error ?? new BadRequest('запрос не прочитан'));
      else resolve(value);
    };
    const onEnd = (): void => finish(new BadRequest('запрос не прочитан'));
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf('\r\n\r\n');
      if (end >= 0) finish(null, { head: buffer.subarray(0, end).toString('latin1'), rest: buffer.subarray(end + 4) });
      else if (buffer.length > HEAD_LIMIT) finish(new BadRequest('голова запроса слишком длинная'));
    };
    socket.on('data', onData);
    socket.once('end', onEnd);
  });
}

function pipeBoth(client: Socket, upstream: Socket): void {
  for (const socket of [client, upstream]) {
    socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy());
    socket.on('error', () => undefined);
  }
  client.pipe(upstream);
  upstream.pipe(client);
  client.once('close', () => upstream.destroy());
  upstream.once('close', () => client.destroy());
}

export interface EgressOptions {
  dial?: Dial;
  onRefused?: (refusal: Refusal) => void;
}

export class DesignEgress {
  private server: Server | undefined;
  private readonly sockets = new Set<Socket>();
  readonly refusals: Refusal[] = [];
  private readonly dial: Dial;

  constructor(
    private readonly guard: DesignGuard,
    private readonly options: EgressOptions = {},
  ) {
    this.dial = options.dial ?? tcpDial;
  }

  async start(): Promise<string> {
    if (this.server !== undefined) return this.url();
    const server = createServer((socket) => void this.serve(socket));
    server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    this.server = server;
    return this.url();
  }

  url(): string {
    const address = this.server?.address();
    if (address === null || address === undefined || typeof address === 'string') throw new Error('прокси не запущен');
    return `http://127.0.0.1:${portOf(address)}`;
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    for (const socket of this.sockets) socket.destroy();
    if (server !== undefined) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async serve(client: Socket): Promise<void> {
    client.on('error', () => undefined);
    try {
      const { head, rest } = await readHead(client);
      const request = parseRequest(head);
      const upstream = await this.open(request);
      this.relay(request, client, upstream, rest);
    } catch (error) {
      client.end(this.answer(error));
    }
  }

  private async open(request: ProxyRequest): Promise<Socket> {
    let target: Target;
    try {
      target = await this.guard.resolve(request.host, request.port);
    } catch (error) {
      if (error instanceof AddressRefused) this.refused(request, error);
      throw error;
    }
    return this.first(target);
  }

  // Первый адрес, что ответил. Все уже проверены, имя второй раз не разрешается.
  private async first(target: Target): Promise<Socket> {
    let last: unknown = new Error('нет адресов');
    for (const entry of target.addresses) {
      try {
        return await this.dial(entry.address, target.port);
      } catch (error) {
        last = error;
      }
    }
    throw last;
  }

  private relay(request: ProxyRequest, client: Socket, upstream: Socket, rest: Buffer): void {
    if (request.tunnel) client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    else upstream.write(upstreamHead(request));
    if (rest.length > 0) upstream.write(rest);
    pipeBoth(client, upstream);
  }

  private refused(request: ProxyRequest, error: AddressRefused): void {
    const refusal = { host: request.host, port: request.port, reason: error.reason, internal: error.internal };
    this.refusals.push(refusal);
    this.options.onRefused?.(refusal);
  }

  private answer(error: unknown): string {
    if (error instanceof BadRequest) return replyOf(400, error.message);
    if (error instanceof AddressRefused) return replyOf(403, error.reason);
    return replyOf(502, 'сайт не отвечает');
  }
}

const portOf = (address: AddressInfo): number => address.port;
