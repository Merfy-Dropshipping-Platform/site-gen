import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BadRequest,
  DesignEgress,
  parseRequest,
  replyOf,
  splitHostPort,
  tcpDial,
  upstreamHead,
  type Dial,
} from '../src/design/design-egress';
import { DesignGuard, type HostLookup } from '../src/design/design-guard';

// Прокси «Дизайна по ссылке» на настоящих сокетах: на каждое соединение — проверка имени и всех адресов, соединение с
// проверенным IP. «Публичный» сайт теста — shop.test → 93.184.216.34, на деле соединение уходит на локальный сервер
// (подмена `dial`); внутренний сервер на 127.0.0.1 считает, сколько до него дошло запросов: должно быть 0.

const PUBLIC_IP = '93.184.216.34';
const portOf = (server: Server): number => {
  const address: AddressInfo | string | null = server.address();
  return typeof address === 'object' && address !== null ? address.port : 0;
};

let shop: Server;
let internal: Server;
let internalHits = 0;
let egress: DesignEgress;
let proxyPort = 0;

const lookup: HostLookup = (host) => {
  const table: Record<string, string> = {
    'shop.test': PUBLIC_IP,
    'localtest.me': '127.0.0.1',
    'inner.test': '10.0.0.5',
  };
  const address = table[host];
  return address === undefined ? Promise.reject(new Error('ENOTFOUND')) : Promise.resolve([{ address, family: 4 }]);
};

// Проверенный «публичный» адрес — на локальный сервер магазина; любой другой — как есть (внутренние до сюда не доходят).
const dial: Dial = (address, port) =>
  address === PUBLIC_IP ? tcpDial('127.0.0.1', portOf(shop)) : tcpDial(address, port);

beforeAll(async () => {
  internal = createServer((_, res) => {
    internalHits += 1;
    res.end('секрет');
  });
  shop = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: `http://127.0.0.1:${portOf(internal)}/secret` }).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' }).end(`магазин ${req.url ?? ''}`);
  });
  await Promise.all(
    [internal, shop].map((server) => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))),
  );
  egress = new DesignEgress(new DesignGuard({ lookup }), { dial });
  proxyPort = Number(new URL(await egress.start()).port);
});

afterAll(async () => {
  await egress.close();
  await Promise.all([internal, shop].map((server) => new Promise((resolve) => server.close(resolve))));
});

// Сырой запрос к прокси; ответ — всё, что пришло до закрытия (или до `untilHead` — для CONNECT).
function raw(request: string, untilHead = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket: Socket = connect(proxyPort, '127.0.0.1');
    let answer = '';
    socket.on('data', (chunk) => {
      answer += chunk.toString('utf8');
      if (untilHead && answer.includes('\r\n\r\n')) socket.destroy();
    });
    socket.on('close', () => resolve(answer));
    socket.on('error', reject);
    socket.write(request);
  });
}

const status = (answer: string): number => Number(/^HTTP\/1\.1 (\d{3})/.exec(answer)?.[1] ?? 0);

describe('прокси «Дизайна по ссылке»', () => {
  it('внутренний IP и localhost — 403 с отметкой фильтра', async () => {
    const connectLoopback = await raw('CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\n\r\n');
    expect(status(connectLoopback)).toBe(403);
    expect(connectLoopback.toLowerCase()).toContain('x-merfy-egress: refused');
    expect(status(await raw(`GET http://127.0.0.1:${portOf(internal)}/ HTTP/1.1\r\nHost: x\r\n\r\n`))).toBe(403);
    expect(status(await raw('GET http://localhost/ HTTP/1.1\r\nHost: localhost\r\n\r\n'))).toBe(403);
    expect(status(await raw('CONNECT [::1]:443 HTTP/1.1\r\n\r\n'))).toBe(403);
    expect(status(await raw('CONNECT 169.254.169.254:80 HTTP/1.1\r\n\r\n'))).toBe(403);
  });

  it('имя, которое разрешается во внутренний адрес (localtest.me → 127.0.0.1), — 403', async () => {
    expect(status(await raw('CONNECT localtest.me:443 HTTP/1.1\r\n\r\n'))).toBe(403);
    expect(status(await raw('GET http://localtest.me/ HTTP/1.1\r\nHost: localtest.me\r\n\r\n'))).toBe(403);
  });

  it('порт не 80/443 — 403, и для CONNECT, и для обычного HTTP', async () => {
    expect(status(await raw('CONNECT shop.test:8080 HTTP/1.1\r\n\r\n'))).toBe(403);
    expect(status(await raw('GET http://shop.test:8443/ HTTP/1.1\r\nHost: shop.test\r\n\r\n'))).toBe(403);
  });

  it('WebSocket на внутренний адрес — 403 (и через CONNECT, и обычным HTTP с Upgrade)', async () => {
    expect(status(await raw('CONNECT inner.test:443 HTTP/1.1\r\n\r\n'))).toBe(403);
    const upgrade = [
      `GET http://127.0.0.1:${portOf(internal)}/ws HTTP/1.1`,
      'Host: 127.0.0.1',
      'Connection: Upgrade',
      'Upgrade: websocket',
      'Sec-WebSocket-Version: 13',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      '',
      '',
    ].join('\r\n');
    expect(status(await raw(upgrade))).toBe(403);
    expect(status(await raw(upgrade.replace(`127.0.0.1:${portOf(internal)}`, 'inner.test')))).toBe(403);
  });

  it('редирект на внутренний адрес: прокси отдаёт 302 как есть, а следующий шаг — новый запрос — 403', async () => {
    const first = await raw('GET http://shop.test/redirect HTTP/1.1\r\nHost: shop.test\r\n\r\n');
    expect(status(first)).toBe(302);
    const location = /location: (\S+)/i.exec(first)?.[1] ?? '';
    expect(location).toContain('127.0.0.1');
    expect(status(await raw(`GET ${location} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`))).toBe(403);
  });

  it('публичный сайт — ответ через проверенный адрес; CONNECT — туннель', async () => {
    const answer = await raw(
      'GET http://shop.test/page?x=1 HTTP/1.1\r\nHost: shop.test\r\nProxy-Connection: keep-alive\r\n\r\n',
    );
    expect(status(answer)).toBe(200);
    expect(answer).toContain('магазин /page?x=1');
    const tunnel = await new Promise<string>((resolve, reject) => {
      const socket = connect(proxyPort, '127.0.0.1');
      let answerText = '';
      socket.on('data', (chunk) => {
        answerText += chunk.toString('utf8');
        if (answerText.includes('Connection Established') && !answerText.includes('магазин')) {
          socket.write('GET /through HTTP/1.1\r\nHost: shop.test\r\nConnection: close\r\n\r\n');
        }
      });
      socket.on('close', () => resolve(answerText));
      socket.on('error', reject);
      socket.write('CONNECT shop.test:80 HTTP/1.1\r\n\r\n');
    });
    expect(tunnel).toContain('200 Connection Established');
    expect(tunnel).toContain('магазин /through');
  });

  it('внутренний сервер не получил ни одного запроса; отказы записаны', () => {
    expect(internalHits).toBe(0);
    expect(egress.refusals.length).toBeGreaterThanOrEqual(8);
    expect(egress.refusals.every((refusal) => refusal.reason.length > 0)).toBe(true);
  });

  it('кривой запрос — 400, сайт не отвечает — 502', async () => {
    expect(status(await raw('ПРИВЕТ\r\n\r\n'))).toBe(400);
    expect(status(await raw('GET /relative HTTP/1.1\r\nHost: x\r\n\r\n'))).toBe(400);
    const dead = new DesignEgress(new DesignGuard({ lookup }), {
      dial: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    const port = Number(new URL(await dead.start()).port);
    expect(await dead.start()).toBe(`http://127.0.0.1:${port}`);
    const answer = await new Promise<string>((resolve) => {
      const socket = connect(port, '127.0.0.1');
      let text = '';
      socket.on('data', (chunk) => (text += chunk.toString('utf8')));
      socket.on('close', () => resolve(text));
      socket.write('CONNECT shop.test:443 HTTP/1.1\r\n\r\n');
    });
    expect(status(answer)).toBe(502);
    await dead.close();
    expect(() => dead.url()).toThrow('прокси не запущен');
  });
});

describe('разбор запросов прокси', () => {
  it('CONNECT и обычный HTTP', () => {
    expect(parseRequest('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com')).toMatchObject({
      tunnel: true,
      host: 'example.com',
      port: 443,
    });
    expect(parseRequest('CONNECT [2001:db8::1]:443 HTTP/1.1')).toMatchObject({ host: '2001:db8::1', port: 443 });
    const plain = parseRequest(
      'GET http://example.com/a?b HTTP/1.1\r\nHost: example.com\r\nConnection: keep-alive\r\nProxy-Authorization: x',
    );
    expect(plain).toMatchObject({
      tunnel: false,
      host: 'example.com',
      port: 80,
      path: '/a?b',
      headers: ['Host: example.com'],
    });
    expect(upstreamHead(plain)).toBe('GET /a?b HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n');
    const ws = parseRequest('GET http://example.com/ws HTTP/1.1\r\nConnection: Upgrade\r\nUpgrade: websocket');
    expect(upstreamHead(ws)).toBe('GET /ws HTTP/1.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  });

  it('отказы разбора', () => {
    expect(() => parseRequest('GET')).toThrow(BadRequest);
    expect(() => parseRequest('GET https://example.com/ HTTP/1.1')).toThrow(BadRequest);
    expect(() => splitHostPort('', 443)).toThrow(BadRequest);
    expect(splitHostPort('example.com', 443)).toEqual({ host: 'example.com', port: 443 });
    expect(replyOf(502, 'нет')).toContain('HTTP/1.1 502 Bad Gateway');
    expect(replyOf(418, 'x')).toContain('418 Error');
  });
});
