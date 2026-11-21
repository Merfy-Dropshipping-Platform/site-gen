import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { NodeFailed, loopbackKey, nodeEnv, parseJson, runNode } from '../src/design/design-node';
import { dembrandt } from '../src/design/tools/dembrandt';
import { designlang } from '../src/design/tools/designlang';
import { dependenciesOf } from '../src/design/tools/tool';
import { fakeCaptured } from './design-fake';

// Подпроцесс инструмента дизайна на настоящем Node: JSON из stdout, срок и kill, сеть закрыта netguard.mjs.
// Скрипты-двойники — во временной папке ОС.

const dir = mkdtempSync(join(tmpdir(), 'design-node-test-'));
const script = (name: string, body: string): string => {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
};

let allowedServer: Server;
let allowedPort = 0;
beforeAll(async () => {
  allowedServer = createServer((socket) => {
    socket.on('error', () => undefined);
    socket.end('ok');
  });
  await new Promise<void>((resolve) => allowedServer.listen(0, '127.0.0.1', resolve));
  const address = allowedServer.address();
  allowedPort = typeof address === 'object' && address !== null ? address.port : 0;
});
afterAll(() => new Promise((resolve) => allowedServer.close(resolve)));

const base = () => ({ proxy: `http://127.0.0.1:${allowedPort}`, cdp: 'http://127.0.0.1:1', timeoutMs: 10_000 });

describe('подпроцесс инструмента дизайна', () => {
  it('первый JSON-объект из stdout, даже после строки', async () => {
    const path = script(
      'ok.mjs',
      "process.stdout.write('Starting…\\n' + JSON.stringify({ a: 1, home: process.env.HOME.length > 0, secret: process.env.RABBITMQ_URL ?? null }));",
    );
    process.env.RABBITMQ_URL = 'amqp://секрет';
    expect(await runNode({ ...base(), script: path, args: [] })).toEqual({ a: 1, home: true, secret: null });
    delete process.env.RABBITMQ_URL;
  });

  it('вышел с ошибкой без JSON — причина с концом stderr; не JSON — отказ', async () => {
    await expect(
      runNode({
        ...base(),
        script: script('fail.mjs', "process.stderr.write('сломалось'); process.exit(3);"),
        args: [],
      }),
    ).rejects.toThrow(/кодом 3: сломалось/);
    await expect(
      runNode({ ...base(), script: script('text.mjs', "process.stdout.write('просто текст');"), args: [] }),
    ).rejects.toThrow('не напечатал JSON');
    await expect(
      runNode({ ...base(), script: script('broken.mjs', "process.stdout.write('{ сломан');"), args: [] }),
    ).rejects.toThrow('не JSON');
  });

  it('не уложился в срок — убит, NodeFailed с отметкой срока', async () => {
    const started = Date.now();
    const error = await runNode({
      ...base(),
      timeoutMs: 300,
      script: script('hang.mjs', 'setInterval(() => {}, 1000);'),
      args: [],
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NodeFailed);
    expect(error instanceof NodeFailed && error.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('сеть процесса закрыта: внешний адрес и чужой порт — EACCES, адрес фильтра — можно; UDP — отказ', async () => {
    const probe = script(
      'net.mjs',
      `import net from 'node:net'; import dgram from 'node:dgram';
const tryConnect = (host, port) => new Promise((done) => {
  const s = net.connect({ host, port });
  s.on('connect', () => { s.destroy(); done('connected'); });
  s.on('error', (e) => done(e.code));
});
let udp = 'ok'; try { dgram.createSocket('udp4'); } catch (e) { udp = e.code; }
process.stdout.write(JSON.stringify({
  external: await tryConnect('1.1.1.1', 80),
  local: await tryConnect('127.0.0.1', 5432),
  allowed: await tryConnect('127.0.0.1', ${allowedPort}),
  udp,
}));`,
    );
    expect(await runNode({ ...base(), script: probe, args: [] })).toEqual({
      external: 'EACCES',
      local: 'EACCES',
      allowed: 'connected',
      udp: 'EACCES',
    });
  });

  it('node не найден — отказ', async () => {
    await expect(
      runNode({ ...base(), node: join(dir, 'нет-такого-node'), script: script('x.mjs', ''), args: [] }),
    ).rejects.toThrow(NodeFailed);
  });

  it('настоящие dembrandt и designlang без браузера по CDP отказывают, а не запускают свой', async () => {
    const captured = fakeCaptured({
      cdp: 'http://127.0.0.1:1',
      proxy: 'http://127.0.0.1:2',
    });
    await expect(dembrandt.raw({ captured, budgetMs: 30_000 })).rejects.toThrow();
    await expect(designlang.raw({ captured, budgetMs: 30_000 })).rejects.toThrow(NodeFailed);
  }, 70_000);

  it('окружение с нуля: прокси, разрешённые адреса, без браузеров пакета', () => {
    const env = nodeEnv(
      { ...base(), script: 'x', args: [], env: { BROWSER_CDP_ENDPOINT: 'http://127.0.0.1:1' } },
      '/tmp/h',
    );
    expect(env).toMatchObject({
      HOME: '/tmp/h',
      HTTP_PROXY: base().proxy,
      NODE_USE_ENV_PROXY: '1',
      DESIGN_NET_ALLOW: `127.0.0.1:${allowedPort},127.0.0.1:1`,
      PLAYWRIGHT_BROWSERS_PATH: '/tmp/h/no-browsers',
      BROWSER_CDP_ENDPOINT: 'http://127.0.0.1:1',
    });
    expect(loopbackKey('http://127.0.0.1:9222/')).toBe('127.0.0.1:9222');
    expect(parseJson('шум {"a":[1]}')).toEqual({ a: [1] });
    expect(dependenciesOf('{"dependencies":{"a":"1"}}')).toEqual({ a: '1' });
    expect(dependenciesOf('{"dependencies":null}')).toEqual({});
    expect(dependenciesOf('[]')).toEqual({});
  });
});
