import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import amqplib from 'amqplib';
import { collectPassport, loadReleaseRules, openPage } from '@merfy/stand-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openBroker, type Broker } from '../../src/broker';
import { checkShop, startChecker, type CheckerDeps } from '../../src/checker/check';
import { CHECKS_QUEUE, CHECK_RESULTS_QUEUE, parseCheckResult, type CheckResult } from '../../src/release/checks';
import { STACK, until } from './stack';

// Главная магазина «до» — чистая; «после» — та же с упавшим скриптом или та же самая. Страница отдаётся с этой машины,
// браузер — настоящий Chromium (как в образе storefront-checker). ETag главной — отпечаток содержимого, как у раздачи.
const CLEAN = '<!doctype html><html lang="ru"><head><title>Шарфы</title></head><body><h1>Шарфы</h1></body></html>';
const FAILING = CLEAN.replace('</body>', '<script>throw new Error("cart is undefined")</script></body>');
const etagOf = (text: string): string => `"${createHash('sha256').update(text).digest('hex')}"`;
let html = CLEAN;
let status = 200;
let etag: string | null = etagOf(CLEAN);
let server: Server;
let url = '';
let deps: CheckerDeps;

beforeAll(async () => {
  server = createServer((request, response) => {
    const headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' };
    if (etag !== null) headers.ETag = etag;
    response.writeHead(status, headers).end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  url = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}/`;
  const open = (target: string) => openPage(target, { sabotage: [] }, (page) => collectPassport(page, 'dev'));
  deps = {
    open,
    rules: await loadReleaseRules(),
    log: () => undefined,
    fetch: (address) => fetch(address),
    homePollMs: 10,
    homeWaitMs: 2_000,
  };
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const job = { v: 1 as const, release: 7, siteId: 'shop-1' };

describe('проверяющий процесс на настоящем Chromium', () => {
  it('упавший скрипт после обновления — красный; та же страница — чисто', async () => {
    html = CLEAN;
    const before = await checkShop(deps, { ...job, phase: 'before', url });
    expect(before.error).toBeNull();
    html = FAILING;
    const broken = await checkShop(deps, { ...job, phase: 'after', url, before: before.passport });
    expect(broken.verdict).toBe('red');
    html = CLEAN;
    const same = await checkShop(deps, { ...job, phase: 'after', url, before: before.passport });
    expect(same.verdict).toBe('clean');
  });

  it('страница ответила 503 — ошибка в ответе', async () => {
    status = 503;
    const result = await checkShop(deps, { ...job, phase: 'before', url });
    status = 200;
    expect(result.error).toContain('503');
  });
});

// Гонка раздачи (выпуск платформы №77, 26.10): паспорт «после» снимается, только когда главную отдаёт новая сборка —
// ETag главной совпал с отпечатком из задания. Не совпал за предел — сбой раздачи с понятным текстом, не «красный».
describe('ожидание новой сборки раздачи', () => {
  it('ETag сошёлся — паспорт снят и сравнён', async () => {
    html = CLEAN;
    etag = etagOf(CLEAN);
    const before = await checkShop(deps, { ...job, phase: 'before', url });
    const result = await checkShop(deps, {
      ...job,
      phase: 'after',
      url,
      before: before.passport,
      expected: { home: etagOf(CLEAN).slice(1, -1) },
    });
    expect(result).toMatchObject({ verdict: 'clean', error: null });
  });

  it('ETag так и не сошёлся — ошибка ожидания, паспорт не снят', async () => {
    const result = await checkShop(
      { ...deps, homeWaitMs: 100 },
      { ...job, phase: 'after', url, before: null, expected: { home: 'f'.repeat(64) } },
    );
    expect(result.passport).toBeNull();
    expect(result.verdict).toBeNull();
    expect(result.error).toContain('раздача не сменила главную на новую сборку');
  });

  it('ETag в ответе нет — та же ошибка ожидания', async () => {
    etag = null;
    const result = await checkShop(
      { ...deps, homeWaitMs: 100 },
      { ...job, phase: 'after', url, before: null, expected: { home: 'f'.repeat(64) } },
    );
    etag = etagOf(CLEAN);
    expect(result.error).toContain('ETag нет');
  });
});

describe('проверяющий процесс через очередь стенда', () => {
  let broker: Broker;
  let raw: amqplib.ChannelModel;

  beforeAll(async () => {
    raw = await amqplib.connect(STACK.rabbitmqUrl);
    broker = openBroker(STACK.rabbitmqUrl, () => undefined);
    await broker.publishCheck({ ...job, phase: 'before', url });
    const channel = await raw.createChannel();
    await channel.purgeQueue(CHECKS_QUEUE);
    await channel.purgeQueue(CHECK_RESULTS_QUEUE);
  });

  afterAll(async () => {
    await broker.close();
    await raw.close();
  });

  it('задание в storefront_checks → ответ в storefront_check_results', async () => {
    const results: CheckResult[] = [];
    await startChecker(broker, deps);
    await broker.consume(CHECK_RESULTS_QUEUE, 1, ({ body }) =>
      Promise.resolve(void results.push(parseCheckResult(body))),
    );
    html = CLEAN;
    await broker.publishCheck({ ...job, phase: 'before', url });
    await until(() => Promise.resolve(results.length === 1));
    expect(results[0]).toMatchObject({ release: 7, siteId: 'shop-1', phase: 'before', error: null });
  });
});
