// Задание «снимок черновика» без браузера и сети: отрисовщик и fetch подменены, брокер — запись вызовов.
import { describe, expect, it, vi } from 'vitest';
import { readCheckerSettings } from '../src/checker/check';
import type { Broker, Delivery } from '../src/broker';
import {
  LOOKS_QUEUE,
  LOOK_PATTERN,
  MIN_BUDGET_MS,
  nestReply,
  previewUrl,
  runLookJob,
  startLooks,
  type LookDeps,
  type LookReply,
} from '../src/look/look-job';
import { LookError } from '../src/look/look-types';
import { fakeRenderer, type FakeRendererOptions } from './look-fixture';

const NOW = 1_800_000_000_000;
const SITE = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';
const HTML = '<!doctype html><html><body><merfy-section></merfy-section></body></html>';

const job = (data: Record<string, unknown> = {}) => ({
  pattern: LOOK_PATTERN,
  id: 'c1',
  data: { v: 1, siteId: SITE, page: 'home', devices: 'both', full: false, deadline: NOW + 55_000, ...data },
});

const htmlResponse = (body = HTML) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

function setup(renderer: FakeRendererOptions = {}, fetchImpl?: LookDeps['fetch']) {
  const fake = fakeRenderer(renderer);
  const fetch = vi.fn<LookDeps['fetch']>(fetchImpl ?? (() => Promise.resolve(htmlResponse())));
  const log = vi.fn();
  const deps: LookDeps = {
    renderer: fake.renderer,
    fetch,
    sitesUrl: 'http://sites-service-dev:3114/',
    log,
    now: () => NOW,
  };
  return { deps, fake, fetch, log };
}

function snapshotOf(reply: LookReply) {
  if (!reply.ok) throw new Error(`ждали снимок, пришло ${reply.error.code}`);
  return reply.snapshot;
}

const errorOf = (reply: LookReply) => (reply.ok ? null : reply.error);

describe('снимок черновика · успех', () => {
  it('both — телефон первым: превью от sites, картинки base64, факты, находки с устройством', async () => {
    const findings = [{ rule: 'gradient-text', name: 'Gradient text', detail: 'h1' }];
    const { deps, fake, fetch } = setup({
      mobile: { pageHeight: 844 * 3, shotBytes: 600, findings },
      desktop: { pageHeight: 900, shotBytes: 1_200 },
    });

    const snapshot = snapshotOf(await runLookJob(deps, job()));

    expect(fetch.mock.calls[0]?.[0]).toBe(`http://sites-service-dev:3114/api/sites/${SITE}/preview?page=home`);
    expect(fake.opened[0]?.devices).toEqual(['mobile', 'desktop']);
    expect(fake.opened[0]?.html).toBe(HTML);
    expect(fake.opened[0]?.timeoutMs).toBe(55_000);
    expect(snapshot.devices.map((entry) => [entry.device, entry.screens.total, entry.screens.shown])).toEqual([
      ['mobile', 3, 1],
      ['desktop', 1, 1],
    ]);
    expect(snapshot.devices.map((entry) => Buffer.from(entry.images[0] ?? '', 'base64').length)).toEqual([600, 1_200]);
    expect(snapshot.devices[1]?.viewport).toEqual({ width: 1440, height: 900 });
    expect(snapshot.detector).toEqual({ ok: true });
    expect(snapshot.findings).toEqual([
      {
        source: 'impeccable',
        code: 'gradient-text',
        name: 'Gradient text',
        text: 'h1',
        device: 'mobile',
        section: null,
        clip: null,
      },
    ]);
    expect(snapshot).toMatchObject({ v: 1, siteId: SITE, page: 'home', full: false });
    expect(fake.state.closed).toBe(1);
  });

  it('desktop и full — только компьютер, все экраны; адрес страницы экранируется', async () => {
    const { deps, fake, fetch } = setup({ desktop: { pageHeight: 2_500 } });

    const snapshot = snapshotOf(
      await runLookJob(deps, job({ devices: 'desktop', full: true, page: 'page-custom c2' })),
    );

    expect(fetch.mock.calls[0]?.[0]).toContain('/preview?page=page-custom%20c2');
    expect(fake.opened[0]?.devices).toEqual(['desktop']);
    expect(snapshot.devices[0]?.images).toHaveLength(3);
  });

  it('сообщения консоли урезаны по числу и длине — ответ идёт через брокер', async () => {
    const consoleErrors = Array.from({ length: 80 }, (_, index) => `${index}:${'x'.repeat(900)}`);
    const { deps } = setup({ mobile: { facts: { consoleErrors } } });

    const snapshot = snapshotOf(await runLookJob(deps, job({ devices: 'mobile' })));

    expect(snapshot.devices[0]?.facts.consoleErrors).toHaveLength(50);
    expect(snapshot.devices[0]?.facts.consoleErrors[0]).toHaveLength(500);
  });

  it('детектор упал — снимки есть, причина в ответе', async () => {
    const { deps } = setup({ mobile: { detectError: new Error('WASM не загрузился\nстек') } });

    const snapshot = snapshotOf(await runLookJob(deps, job({ devices: 'mobile' })));

    expect(snapshot.detector).toEqual({ ok: false, reason: 'WASM не загрузился' });
    expect(snapshot.findings).toEqual([]);
    expect(snapshot.devices[0]?.images).toHaveLength(1);
  });
});

describe('снимок черновика · отказы', () => {
  it.each([
    ['не тот pattern', { ...job(), pattern: 'sites.get' }],
    ['лишнее поле', job({ tenantId: 't1' })],
    ['нет срока', { pattern: LOOK_PATTERN, data: { v: 1, siteId: SITE, page: 'home', devices: 'both', full: false } }],
    ['чужое устройство', job({ devices: 'tablet' })],
    ['siteId с путём', job({ siteId: '../admin' })],
    ['не объект', 'look'],
  ])('%s — invalid, браузер не открывается', async (_name, body) => {
    const { deps, fake } = setup();

    expect(errorOf(await runLookJob(deps, body))?.code).toBe('invalid');
    expect(fake.opened).toHaveLength(0);
  });

  it('до срока меньше запаса — expired, sites не спрашивается', async () => {
    const { deps, fetch } = setup();

    const reply = await runLookJob(deps, job({ deadline: NOW + MIN_BUDGET_MS - 1 }));

    expect(errorOf(reply)?.code).toBe('expired');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sites ответил 404 — preview-failed со статусом', async () => {
    const { deps } = setup({}, () => Promise.resolve(new Response('нет', { status: 404 })));

    expect(errorOf(await runLookJob(deps, job()))).toEqual({
      code: 'preview-failed',
      message: 'Не получил превью страницы: sites ответил 404',
      status: 404,
    });
  });

  it('sites прислал не HTML или не ответил — preview-failed', async () => {
    const json = setup({}, () => Promise.resolve(Response.json({ a: 1 })));
    expect(errorOf(await runLookJob(json.deps, job()))?.message).toBe('Не получил превью страницы: пришёл не HTML');

    const down = setup({}, () => Promise.reject(new Error('connect ECONNREFUSED\nстек')));
    expect(errorOf(await runLookJob(down.deps, job()))?.message).toBe(
      'Не получил превью страницы: connect ECONNREFUSED',
    );
  });

  it('браузер не запустился или срок вышел — код и текст отрисовщика', async () => {
    const noBrowser = setup({ openError: new LookError('no-browser', 'Не запустился браузер') });
    expect(errorOf(await runLookJob(noBrowser.deps, job()))).toEqual({
      code: 'no-browser',
      message: 'Не запустился браузер',
    });

    const late = setup({ mobile: { shootError: new LookError('timeout', 'Не успел отрисовать страницу за 30 с') } });
    expect(errorOf(await runLookJob(late.deps, job()))?.code).toBe('timeout');
    expect(late.fake.state.closed).toBe(1);
  });

  it('прочая ошибка отрисовки — render-failed первой строкой', async () => {
    const { deps } = setup({ openError: new Error('Target closed\nстек') });

    expect(errorOf(await runLookJob(deps, job()))).toEqual({
      code: 'render-failed',
      message: 'Не получилось отрисовать страницу: Target closed',
    });
  });
});

describe('снимок черновика · очередь и ответ', () => {
  function fakeBroker() {
    let handler: ((delivery: Delivery) => Promise<void>) | undefined;
    const consume = vi.fn((_queue: string, _prefetch: number, next: (delivery: Delivery) => Promise<void>) => {
      handler = next;
      return Promise.resolve();
    });
    const reply = vi.fn<Broker['reply']>(() => Promise.resolve());
    const deliver = (delivery: Delivery) =>
      handler ? handler(delivery) : Promise.reject(new Error('нет обработчика'));
    return { broker: { consume, reply }, deliver, consume, reply };
  }

  it('слушает storefront_looks по два задания, отвечает в формате Nest на адрес ответа', async () => {
    const { deps, log } = setup();
    const fake = fakeBroker();
    await startLooks(fake.broker, deps);

    await fake.deliver({ exchange: '', body: job(), replyTo: 'amq.rabbitmq.reply-to.x', correlationId: 'c1' });

    expect(fake.consume.mock.calls[0]?.slice(0, 2)).toEqual([LOOKS_QUEUE, 2]);
    const [replyTo, correlationId, body] = fake.reply.mock.calls[0] ?? [];
    expect([replyTo, correlationId]).toEqual(['amq.rabbitmq.reply-to.x', 'c1']);
    expect(body).toMatchObject({ err: null, isDisposed: true, id: 'c1', response: { ok: true } });
    expect(log).toHaveBeenCalledWith(
      'look-done',
      expect.objectContaining({ shopId: SITE, devices: 'mobile,desktop', images: 2 }),
    );
  });

  it('отказ — тоже ответ; без адреса ответа — только строка журнала', async () => {
    const { deps, log } = setup();
    const fake = fakeBroker();
    await startLooks(fake.broker, deps);

    await fake.deliver({ exchange: '', body: job({ devices: 'tablet' }) });

    expect(fake.reply).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('look-failed', expect.objectContaining({ shopId: null, code: 'invalid' }));
  });

  it('ответ без correlationId — без поля id', () => {
    expect(nestReply({ ok: false, error: { code: 'expired', message: 'x' } }, undefined)).toEqual({
      err: null,
      response: { ok: false, error: { code: 'expired', message: 'x' } },
      isDisposed: true,
    });
  });

  it('адрес превью — без двойного слэша', () => {
    const parsed = { v: 1 as const, siteId: 's1', page: 'home', devices: 'both' as const, full: false, deadline: 1 };
    expect(previewUrl('http://sites:3114//', parsed)).toBe('http://sites:3114/api/sites/s1/preview?page=home');
  });
});

describe('настройки проверяющего процесса', () => {
  it('SITES_SERVICE_URL необязателен: нет — снимки выключены', () => {
    expect(readCheckerSettings({ RABBITMQ_URL: 'amqp://x' }).sitesUrl).toBeNull();
    expect(
      readCheckerSettings({ RABBITMQ_URL: 'amqp://x', SITES_SERVICE_URL: 'http://sites-service-dev:3114' }).sitesUrl,
    ).toBe('http://sites-service-dev:3114');
    expect(() => readCheckerSettings({ RABBITMQ_URL: 'amqp://x', SITES_SERVICE_URL: 'ftp://x' })).toThrow(
      /SITES_SERVICE_URL/,
    );
  });
});
