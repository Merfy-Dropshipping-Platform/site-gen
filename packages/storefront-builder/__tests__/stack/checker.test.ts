import { createServer, type Server } from 'node:http';
import amqplib from 'amqplib';
import { collectPassport, loadReleaseRules, openPage } from '@merfy/stand-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openBroker, type Broker } from '../../src/broker';
import { checkShop, startChecker, type CheckerDeps } from '../../src/checker/check';
import { CHECKS_QUEUE, CHECK_RESULTS_QUEUE, parseCheckResult, type CheckResult } from '../../src/release/checks';
import { STACK, until } from './stack';

// Главная магазина «до» — чистая; «после» — та же с упавшим скриптом или та же самая. Страница отдаётся с этой машины,
// браузер — настоящий Chromium (как в образе storefront-checker).
const CLEAN = '<!doctype html><html lang="ru"><head><title>Шарфы</title></head><body><h1>Шарфы</h1></body></html>';
const FAILING = CLEAN.replace('</body>', '<script>throw new Error("cart is undefined")</script></body>');
let html = CLEAN;
let status = 200;
let server: Server;
let url = '';
let deps: CheckerDeps;

beforeAll(async () => {
  server = createServer((request, response) => {
    response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  url = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}/`;
  const open = (target: string) => openPage(target, { sabotage: [] }, (page) => collectPassport(page, 'dev'));
  deps = { open, rules: await loadReleaseRules(), log: () => undefined };
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
