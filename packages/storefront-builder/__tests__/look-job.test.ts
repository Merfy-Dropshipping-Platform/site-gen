// Задание «снимок черновика» без браузера и сети: отрисовщик и fetch подменены, брокер — запись вызовов.
import { describe, expect, it, vi } from 'vitest';
import { readCheckerSettings } from '../src/checker/check';
import type { Broker, Delivery } from '../src/broker';
import {
  LOOKS_QUEUE,
  LOOK_PATTERN,
  MIN_BUDGET_MS,
  SECTION_DETECTOR_TIMEOUT_MS,
  nestReply,
  previewUrl,
  runLookJob,
  startLooks,
  type LookDeps,
  type LookReply,
} from '../src/look/look-job';
import { LookError, type LayoutFinding } from '../src/look/look-types';
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
        image: null,
      },
    ]);
    expect(snapshot.layout).toEqual({ ok: true });
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

const layoutFinding = (code: LayoutFinding['code'], mark: number, section = 'hero-1'): LayoutFinding => ({
  code,
  section,
  text: `${code} · чинить`,
  clip: { x: 0, y: 100 * mark, width: 390, height: 200 },
  mark,
  fixed: false,
});

describe('снимок черновика · проверки вёрстки', () => {
  it('находки с устройством, секцией и вырезкой; вырезок не больше четырёх, телефон первым', async () => {
    const { deps } = setup({
      mobile: {
        pageHeight: 844,
        layout: [
          layoutFinding('row-unequal', 0),
          layoutFinding('row-unequal', 1, 'cards-1'),
          layoutFinding('overflow-x', 2),
          layoutFinding('tap-small', 3),
          layoutFinding('text-small', 4),
        ],
      },
      desktop: { pageHeight: 900, layout: [layoutFinding('overlap', 0), layoutFinding('image-distorted', 1)] },
    });

    const snapshot = snapshotOf(await runLookJob(deps, job()));

    const found = snapshot.findings.filter((finding) => finding.source === 'layout');
    expect(found.map((finding) => `${finding.device}:${finding.code}`)).toEqual([
      'mobile:row-unequal',
      'mobile:row-unequal',
      'mobile:overflow-x',
      'mobile:tap-small',
      'mobile:text-small',
      'desktop:overlap',
      'desktop:image-distorted',
    ]);
    expect(found.every((finding) => finding.clip !== null && finding.section !== null)).toBe(true);
    // Первыми получают вырезку разные коды: сначала по одной на пару «устройство, код» (телефон первым), потом остальные.
    expect(found.map((finding) => finding.image !== null)).toEqual([true, false, true, true, true, false, false]);
    expect(found.filter((finding) => finding.image !== null)).toHaveLength(4);
    expect(snapshot.layout).toEqual({ ok: true });
  });

  it('не больше трёх находок одного кода на устройство', async () => {
    const many = [0, 1, 2, 3, 4].map((mark) => layoutFinding('overlap', mark, `s-${mark}`));
    const { deps } = setup({ mobile: { layout: many } });

    const snapshot = snapshotOf(await runLookJob(deps, job({ devices: 'mobile' })));

    expect(snapshot.findings.map((finding) => finding.code)).toEqual(['overlap', 'overlap', 'overlap']);
  });

  it('вырезки вычитаются из предела 1,5 МБ: вместе с экранами ответ в пределе', async () => {
    const { deps } = setup({
      mobile: {
        pageHeight: 844 * 12,
        shotBytes: 400_000,
        clipBytes: 55_000,
        layout: [0, 1, 2, 3].map((mark) => layoutFinding('overlap', mark, `s-${mark}`)),
      },
    });

    const snapshot = snapshotOf(await runLookJob(deps, job({ devices: 'mobile', full: true })));

    const images = [
      ...snapshot.devices.flatMap((entry) => entry.images),
      ...snapshot.findings.flatMap((finding) => (finding.image === null ? [] : [finding.image])),
    ];
    expect(snapshot.findings.filter((finding) => finding.image !== null)).toHaveLength(3);
    expect(images.reduce((sum, image) => sum + image.length, 0)).toBeLessThanOrEqual(1_500_000);
  });

  it('проверки упали — снимки и детектор есть, причина в ответе', async () => {
    const { deps } = setup({ mobile: { layoutError: new Error('страница закрылась\nстек') } });

    const snapshot = snapshotOf(await runLookJob(deps, job({ devices: 'mobile' })));

    expect(snapshot.layout).toEqual({ ok: false, reason: 'страница закрылась' });
    expect(snapshot.findings).toEqual([]);
    expect(snapshot.devices[0]?.images).toHaveLength(1);
  });

  it('срок вышел во время проверок — отказ timeout, а не причина в ответе', async () => {
    const { deps } = setup({
      mobile: { layoutError: new LookError('timeout', 'Не успел отрисовать страницу за 30 с') },
    });

    const reply = await runLookJob(deps, job({ devices: 'mobile' }));

    expect(errorOf(reply)).toMatchObject({ code: 'timeout' });
  });
});

describe('снимок черновика · одна секция', () => {
  it('картинка — вырезка секции, а не экраны страницы; находки только её', async () => {
    const { deps, fake } = setup({
      mobile: {
        pageHeight: 844 * 6,
        findings: [{ rule: 'page-only', name: 'Page only', detail: 'вся страница' }],
        sectionFindings: { 'hero-1': [{ rule: 'gradient-text', name: 'Gradient text', detail: 'h1' }] },
        layout: [layoutFinding('tap-small', 0, 'hero-1')],
        section: { place: { x: 0, y: 900, width: 390, height: 700, fullHeight: 700, pinned: false }, bytes: 900 },
      },
    });

    const snapshot = snapshotOf(await runLookJob(deps, job({ devices: 'mobile', section: 'hero-1' })));

    expect(snapshot.section).toBe('hero-1');
    expect(snapshot.full).toBe(false);
    expect(snapshot.devices).toHaveLength(1);
    expect(snapshot.devices[0]?.images.map((image) => Buffer.from(image, 'base64').length)).toEqual([900]);
    expect(snapshot.devices[0]?.screens).toEqual({ total: 1, shown: 1 });
    expect(snapshot.devices[0]?.cut).toEqual({ height: 700, shown: 700, pinned: false });
    // Экраны страницы не снимались; детектор запущен с id секции — находки страницы целиком в ответ не попали.
    expect(fake.calls).toEqual([]);
    expect(snapshot.detector).toEqual({ ok: true });
    expect(snapshot.findings.map((finding) => [finding.source, finding.code, finding.section])).toEqual([
      ['impeccable', 'gradient-text', null],
      ['layout', 'tap-small', 'hero-1'],
    ]);
    expect(fake.sectionCalls.detect).toEqual([{ device: 'mobile', section: 'hero-1' }]);
    expect(fake.sectionCalls.layout).toEqual([{ device: 'mobile', section: 'hero-1' }]);
    expect(fake.sectionCalls.shot).toEqual([{ device: 'mobile', section: 'hero-1', quality: 80 }]);
  });

  it('высокая секция: в кадре верх, в ответе — полная высота; прибитая (шапка, баннер) — признак pinned', async () => {
    const tall = setup({
      mobile: { section: { place: { x: 0, y: 0, width: 390, height: 1_600, fullHeight: 3_100, pinned: false } } },
    });
    const pinned = setup({
      mobile: { section: { place: { x: 0, y: 700, width: 390, height: 140, fullHeight: 140, pinned: true } } },
    });

    const tallShot = snapshotOf(await runLookJob(tall.deps, job({ devices: 'mobile', section: 'long-1' })));
    const pinnedShot = snapshotOf(await runLookJob(pinned.deps, job({ devices: 'mobile', section: 'cookie-1' })));

    expect(tallShot.devices[0]?.cut).toEqual({ height: 3_100, shown: 1_600, pinned: false });
    expect(pinnedShot.devices[0]?.cut).toEqual({ height: 140, shown: 140, pinned: true });
  });

  it('вес: вырезки находок вычитаются из предела, картинка секции идёт на худшем качестве, если не влезла', async () => {
    const { deps, fake } = setup({
      mobile: {
        clipBytes: 55_000,
        layout: [0, 1, 2, 3].map((mark) => layoutFinding('overlap', mark, `s-${mark}`)),
        section: { bytes: (quality) => quality * 15_000 },
      },
    });

    const snapshot = snapshotOf(await runLookJob(deps, job({ devices: 'mobile', section: 's-1' })));

    const images = [
      ...snapshot.devices.flatMap((entry) => entry.images),
      ...snapshot.findings.flatMap((finding) => (finding.image === null ? [] : [finding.image])),
    ];
    expect(images.reduce((sum, image) => sum + image.length, 0)).toBeLessThanOrEqual(1_500_000);
    // 80 → 1 200 000 байт не влезло рядом с вырезками, 62 → 930 000 влезло.
    expect(fake.sectionCalls.shot.map((call) => call.quality)).toEqual([80, 62]);
  });

  it('секции нет ни на одном устройстве — section-not-found; на одном из двух — снимок без её картинки', async () => {
    const none = setup({ mobile: { section: { place: null } } });
    expect(errorOf(await runLookJob(none.deps, job({ devices: 'mobile', section: 'ghost-1' })))).toEqual({
      code: 'section-not-found',
      message: 'Не нашёл секцию на странице превью: её нет в черновике этой страницы или она скрыта',
    });
    expect(none.fake.state.closed).toBe(1);

    const half = setup({ desktop: { section: { place: null } } });
    const snapshot = snapshotOf(await runLookJob(half.deps, job({ section: 'menu-1' })));
    expect(snapshot.devices.map((entry) => [entry.device, entry.images.length, entry.cut === null])).toEqual([
      ['mobile', 1, false],
      ['desktop', 0, true],
    ]);
    expect(snapshot.devices[1]?.screens).toEqual({ total: 1, shown: 0 });
  });

  it('снимок страницы без секции: section null, cut null, locateSection не зовётся', async () => {
    const { deps, fake } = setup();

    const snapshot = snapshotOf(await runLookJob(deps, job()));

    expect(snapshot.section).toBeNull();
    expect(snapshot.devices.map((entry) => entry.cut)).toEqual([null, null]);
    expect(fake.sectionCalls.located).toEqual([]);
  });

  it('id секции не по форме — invalid, браузер не открывается', async () => {
    const { deps, fake } = setup();

    for (const section of ['', 'a b', '"]; drop', 'x'.repeat(101)]) {
      expect(errorOf(await runLookJob(deps, job({ section })))?.code).toBe('invalid');
    }
    expect(fake.opened).toHaveLength(0);
  });

  it('в журнале — id секции', async () => {
    const { deps, log } = setup();
    const broker = (() => {
      let handler: ((delivery: Delivery) => Promise<void>) | undefined;
      return {
        consume: (_queue: string, _prefetch: number, next: (delivery: Delivery) => Promise<void>) => {
          handler = next;
          return Promise.resolve();
        },
        reply: () => Promise.resolve(),
        deliver: (delivery: Delivery) => (handler ? handler(delivery) : Promise.resolve()),
      };
    })();
    await startLooks(broker, deps);

    await broker.deliver({ exchange: '', body: job({ devices: 'mobile', section: 'hero-1' }) });

    expect(log).toHaveBeenCalledWith('look-done', expect.objectContaining({ section: 'hero-1', images: 1 }));
  });
});

describe('снимок черновика · детектор в снимке секции', () => {
  const gradient = { rule: 'gradient-text', name: 'Gradient text', detail: 'background-clip: text + gradient' };
  const sideTab = { rule: 'side-tab', name: 'Side-tab accent border', detail: 'border-left: 6px' };
  // Даёт заданию дойти до ожидания детектора (таймеры подменены, а setImmediate — настоящий), потом двигает часы.
  const pass = async (ms: number) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(ms);
  };

  it('находки только своей секции, в форме находок страницы; детектор зовётся один раз', async () => {
    const { deps, fake } = setup({
      mobile: {
        findings: [gradient, sideTab],
        sectionFindings: { 'hero-1': [gradient], 'cards-2': [sideTab] },
      },
    });

    const hero = snapshotOf(await runLookJob(deps, job({ devices: 'mobile', section: 'hero-1' })));
    const cards = snapshotOf(await runLookJob(deps, job({ devices: 'mobile', section: 'cards-2' })));
    const empty = snapshotOf(await runLookJob(deps, job({ devices: 'mobile', section: 'footer-3' })));

    const asPage = (rule: string, name: string, text: string) => ({
      source: 'impeccable',
      code: rule,
      name,
      text,
      device: 'mobile',
      section: null,
      clip: null,
      image: null,
    });
    expect(hero.detector).toEqual({ ok: true });
    expect(hero.findings).toEqual([asPage('gradient-text', 'Gradient text', 'background-clip: text + gradient')]);
    expect(cards.findings).toEqual([asPage('side-tab', 'Side-tab accent border', 'border-left: 6px')]);
    expect(empty.detector).toEqual({ ok: true });
    expect(empty.findings).toEqual([]);
    expect(fake.sectionCalls.detect.map((call) => call.section)).toEqual(['hero-1', 'cards-2', 'footer-3']);
  });

  it('два устройства: детектор на первом, где секцию видно; находки детектора идут перед проверками вёрстки', async () => {
    const { deps, fake } = setup({
      mobile: { section: { place: null } },
      desktop: {
        sectionFindings: { 'menu-1': [gradient] },
        layout: [layoutFinding('overlap', 0, 'menu-1')],
      },
    });

    const snapshot = snapshotOf(await runLookJob(deps, job({ section: 'menu-1' })));

    expect(fake.sectionCalls.detect).toEqual([{ device: 'desktop', section: 'menu-1' }]);
    expect(snapshot.findings.map((finding) => [finding.source, finding.code, finding.device])).toEqual([
      ['impeccable', 'gradient-text', 'desktop'],
      ['layout', 'overlap', 'desktop'],
    ]);
  });

  it('детектор упал — первая строка ошибки в причине, снимок секции и проверки вёрстки на месте', async () => {
    const { deps, fake } = setup({
      mobile: {
        detectError: new Error('WASM не загрузился\nстек'),
        layout: [layoutFinding('tap-small', 0, 'hero-1')],
      },
    });

    const snapshot = snapshotOf(await runLookJob(deps, job({ devices: 'mobile', section: 'hero-1' })));

    expect(snapshot.detector).toEqual({ ok: false, reason: 'WASM не загрузился' });
    expect(snapshot.layout).toEqual({ ok: true });
    expect(snapshot.findings.map((finding) => finding.source)).toEqual(['layout']);
    expect(snapshot.devices[0]?.images).toHaveLength(1);
    expect(fake.state.closed).toBe(1);
  });

  it('детектор не уложился в предел — «не успел за 3 с», остальное отдаётся как раньше', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { deps, fake } = setup({
        mobile: { detectHangs: true, layout: [layoutFinding('tap-small', 0, 'hero-1')] },
      });

      const running = runLookJob(deps, job({ devices: 'mobile', section: 'hero-1' }));
      await pass(SECTION_DETECTOR_TIMEOUT_MS);
      const snapshot = snapshotOf(await running);

      expect(SECTION_DETECTOR_TIMEOUT_MS).toBe(3_000);
      expect(snapshot.detector).toEqual({ ok: false, reason: 'не успел за 3 с' });
      expect(snapshot.findings.map((finding) => finding.source)).toEqual(['layout']);
      expect(snapshot.devices[0]?.images).toHaveLength(1);
      expect(fake.state.closed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('до срока задания мало времени — предел короче, а при остатке меньше запаса детектор не зовётся', async () => {
    // Часы после открытия страницы: до срока 2 с (предел 0,5 с) и 1 с (детектор не запускается).
    const withClock = (left: number) => {
      const made = setup({ mobile: { detectHangs: true } });
      const open = made.deps.renderer.open.bind(made.deps.renderer);
      made.deps.renderer = {
        open: async (input) => {
          const rendered = await open(input);
          made.deps.now = () => NOW + 55_000 - left;
          return rendered;
        },
      };
      return made;
    };

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const short = withClock(2_000);
      const running = runLookJob(short.deps, job({ devices: 'mobile', section: 'hero-1' }));
      await pass(500);
      expect(snapshotOf(await running).detector).toEqual({ ok: false, reason: 'не успел за 0.5 с' });

      const none = withClock(1_000);
      const skipped = snapshotOf(await runLookJob(none.deps, job({ devices: 'mobile', section: 'hero-1' })));
      expect(skipped.detector).toEqual({ ok: false, reason: 'не успел: срок снимка почти вышел' });
      expect(none.fake.sectionCalls.detect).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('снимок страницы без секции: детектор без id секции, предела нет', async () => {
    const { deps, fake } = setup({ mobile: { findings: [gradient], sectionFindings: { 'hero-1': [sideTab] } } });

    const snapshot = snapshotOf(await runLookJob(deps, job({ devices: 'mobile' })));

    expect(fake.sectionCalls.detect).toEqual([{ device: 'mobile', section: undefined }]);
    expect(snapshot.findings.map((finding) => finding.code)).toEqual(['gradient-text']);
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

describe('снимок черновика · запись шаблона и вырезки по запросу (шаг 4)', () => {
  const sampleHtml = (sample: unknown) =>
    `<!doctype html><html><body><script type="application/json" id="merfy-look-sample">${JSON.stringify(sample)}</script></body></html>`;

  it('record уходит в адрес превью; нашлась ли запись — в ответе, название берётся из превью', async () => {
    const found = { type: 'product', asked: 'palto', found: true, title: 'Пальто' };
    const { deps, fetch } = setup({}, () => Promise.resolve(htmlResponse(sampleHtml({ v: 1, record: found }))));

    const snapshot = snapshotOf(await runLookJob(deps, job({ page: 'product', record: 'palto' })));

    expect(fetch.mock.calls[0]?.[0]).toContain('/preview?page=product&record=palto');
    expect(snapshot.record).toEqual(found);
    expect(snapshot.cart).toBeNull();
  });

  it('записи нет — found: false, снимок всё равно снят: сообщить об этом решает потребитель', async () => {
    const missing = { type: 'product', asked: 'нет-такого', found: false, title: null };
    const { deps } = setup({}, () => Promise.resolve(htmlResponse(sampleHtml({ v: 1, record: missing }))));

    const snapshot = snapshotOf(await runLookJob(deps, job({ page: 'product', record: 'нет-такого' })));

    expect(snapshot.record?.found).toBe(false);
    expect(snapshot.devices[0]?.images).toHaveLength(1);
  });

  it('страница корзины: число строк корзины снимка; без тега в превью record и cart — null', async () => {
    const line = {
      id: 'look-line-1',
      productId: 'p1',
      variantCombinationId: null,
      quantity: 1,
      unitPriceCents: 100,
      name: 'Шарф',
      imageUrl: null,
      options: {},
    };
    const withCart = setup({}, () =>
      Promise.resolve(htmlResponse(sampleHtml({ v: 1, cart: { lines: [line, line] } }))),
    );
    expect(snapshotOf(await runLookJob(withCart.deps, job({ page: 'page-cart' }))).cart).toEqual({ lines: 2 });

    const plain = setup();
    const snapshot = snapshotOf(await runLookJob(plain.deps, job()));
    expect([snapshot.record, snapshot.cart]).toEqual([null, null]);
  });

  it('тег не по форме не ломает снимок: считается, что превью ничего не сообщило', async () => {
    const { deps } = setup({}, () => Promise.resolve(htmlResponse(sampleHtml({ v: 2, cart: 'x' }))));
    const snapshot = snapshotOf(await runLookJob(deps, job({ page: 'page-cart' })));
    expect([snapshot.record, snapshot.cart]).toEqual([null, null]);
  });

  it('clips: false — находки вёрстки текстом, без вырезок; по умолчанию вырезки как раньше', async () => {
    const layout = [layoutFinding('row-unequal', 0), layoutFinding('overflow-x', 1)];
    const quiet = setup({ mobile: { pageHeight: 844, layout } });
    const without = snapshotOf(await runLookJob(quiet.deps, job({ clips: false })));
    const found = without.findings.filter((finding) => finding.source === 'layout');
    expect(found).toHaveLength(2);
    expect(found.every((finding) => finding.image === null && finding.clip !== null)).toBe(true);

    const usual = setup({ mobile: { pageHeight: 844, layout } });
    const withClips = snapshotOf(await runLookJob(usual.deps, job()));
    expect(withClips.findings.filter((finding) => finding.image !== null)).toHaveLength(2);
  });

  it('record не по форме (пустой, длиннее 200) — invalid, превью не читается', async () => {
    const { deps, fetch } = setup();
    expect(errorOf(await runLookJob(deps, job({ record: '' })))?.code).toBe('invalid');
    expect(errorOf(await runLookJob(deps, job({ record: 'x'.repeat(201) })))?.code).toBe('invalid');
    expect(fetch).not.toHaveBeenCalled();
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
