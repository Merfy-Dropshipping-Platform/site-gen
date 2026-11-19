// Web Vitals и Lighthouse по вкладке снимка в настоящем Chromium (18.11). Пропускается, если браузера Playwright нет
// (`pnpm exec playwright install chromium`); сети не требуют: картинки — data: или с запасного адреса `.invalid`.
// ЦП не замедляется (`cpuRate: 1`): время запуска секций в фикстуре задано занятым циклом и от машины не зависит.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { lighthouseFindings } from '../src/checks/browser/lighthouse';
import { totalBlocking, vitalsFindings, VitalsRaw } from '../src/checks/browser/vitals';
import { ChromiumRenderer } from '../src/look/look-browser';

const hasChromium = existsSync(chromium.executablePath());

// Большая картинка первого экрана (векторная, 800×600). Однотонную картинку в 120 байт Chromium в кандидаты LCP не берёт —
// меньше 0,05 бита на пиксель, «заглушка» (проверено 18.11: главным становился заголовок); 32 КБ комментария дают вес.
const BIG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><!-- ${'0123456789abcdef'.repeat(2_048)} -->` +
    '<rect width="800" height="600" fill="#7c3aed"/></svg>',
)}`;

// Секции: top-1 — ленивая главная картинка (размер задан — сама она не прыгает); hero-1 — внизу блок, который вырастает
// после загрузки (сдвигается список ниже — секция list-1, но виновата hero-1); slow-1 — тяжёлый запуск. Скрипт в конце —
// как ядро: после первой отрисовки и картинки секции запускаются подряд одной задачей, после каждой —
// data-merfy-state="mounted" и событие merfy:section:mount на document; в той же задаче вырастает блок — всё до тишины в
// сети, после которой снимок начинает прокрутку.
const VITALS_PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;font-family:sans-serif} merfy-section{display:block} .row{height:50px;border-bottom:1px solid #ccc}</style>
</head><body>
<merfy-section data-section-id="top-1"><img id="big" src="${BIG}" width="800" height="600" loading="lazy" alt="Шарфы" style="width:100%;height:auto"></merfy-section>
<merfy-section data-section-id="hero-1"><h1>Тёплые шарфы</h1><div id="grow"></div></merfy-section>
<merfy-section data-section-id="list-1"><div class="row">Шарф 1</div><div class="row">Шарф 2</div><div class="row">Шарф 3</div></merfy-section>
<merfy-section data-section-id="slow-1"><p>Тяжёлый запуск</p></merfy-section>
<merfy-section data-section-id="fast-1"><p>Быстрый запуск</p></merfy-section>
<script>
  const busy = (ms) => { const end = performance.now() + ms; while (performance.now() < end) {} };
  const mount = (id, ms) => {
    busy(ms);
    document.querySelector('[data-section-id="' + id + '"]').setAttribute('data-merfy-state', 'mounted');
    document.dispatchEvent(new CustomEvent('merfy:section:mount', { detail: { section: id } }));
  };
  const painted = new Promise((resolve) => new PerformanceObserver((list) => {
    if (list.getEntries().some((entry) => entry.name === 'first-contentful-paint')) resolve();
  }).observe({ type: 'paint', buffered: true }));
  Promise.all([painted, document.getElementById('big').decode()]).then(() => requestAnimationFrame(() => setTimeout(() => {
    mount('top-1', 5); mount('hero-1', 5); mount('list-1', 5); mount('slow-1', 320); mount('fast-1', 5);
    document.getElementById('grow').style.height = '300px';
  }, 0)));
</script>
</body></html>`;

// Короткая страница (прокручивать нечего): тяжёлая задача — сразу после метки конца загрузки, как работа самого снимка
// (axe, детектор). В TBT она идти не должна.
const LATE_PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<merfy-section data-section-id="hero-1"><h1>Тёплые шарфы</h1></merfy-section>
<script>
  const busy = (ms) => { const end = performance.now() + ms; while (performance.now() < end) {} };
  const wait = setInterval(() => {
    if (window.__lookVitals && window.__lookVitals.loadedAt !== null) { clearInterval(wait); busy(400); }
  }, 20);
</script>
</body></html>`;

// Баннер cookie (19.11): корень баннера с атрибутом hidden. Со стилем платформы (класс на <html> ставит скрипт в <head>)
// он виден с первого кадра; без стиля его показывает скрипт после разбора HTML — первый экран ждёт скрипта.
const bannerPage = (shownByCss: boolean): string => `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0}merfy-section{display:block}p{font-size:32px;margin:0}
@layer theme, base, components, utilities;
@layer base{[hidden]:where(:not([hidden='until-found'])){display:none!important}}
@layer theme{html.mfy-consent-new [data-role="cookie-banner"]>[hidden]{display:block!important}}</style>
${shownByCss ? '<script>document.documentElement.classList.add("mfy-consent-new")</script>' : ''}
</head><body>
<merfy-section data-section-id="banner-1" data-role="cookie-banner"><section hidden><p>Мы используем файлы cookie, чтобы сайт работал корректно</p></section></merfy-section>
${shownByCss ? '' : '<script>addEventListener("DOMContentLoaded",()=>{document.querySelector("[hidden]").hidden=false})</script>'}
</body></html>`;

// Lighthouse: картинка без размеров (адрес в сети, не data:), ссылка javascript:void(0), поле с запретом вставки — каждое
// в своей секции.
const LIGHTHOUSE_PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Шарфы</title></head><body>
<merfy-section data-section-id="media-1"><img src="/i/scarf.png" alt="Шарф"></merfy-section>
<merfy-section data-section-id="links-1"><a href="javascript:void(0)">Открыть каталог</a></merfy-section>
<merfy-section data-section-id="form-1"><label>Телефон <input id="phone" onpaste="event.preventDefault()"></label></merfy-section>
<merfy-section data-section-id="ok-1"><img src="/i/ok.png" width="100" height="100" alt="Хорошо"><a href="/catalog">Каталог</a></merfy-section>
</body></html>`;

describe.skipIf(!hasChromium)('Web Vitals и Lighthouse по вкладке снимка · настоящий Chromium', () => {
  const renderer = new ChromiumRenderer({ cpuRate: 1 });
  afterAll(() => renderer.close());

  it('прыжок — на секции, которая выросла, а не на сдвинутой; тяжёлый запуск — на своей секции; ленивая главная картинка', async () => {
    const rendered = await renderer.open({ html: VITALS_PAGE, devices: ['mobile'] });
    try {
      const [mobile] = rendered.sessions;
      if (mobile === undefined) throw new Error('нет экрана');
      const found = vitalsFindings(await mobile.vitals(), 'mobile');
      const byRule = (rule: string) => found.filter((finding) => finding.rule === rule);
      // 300 px блока и нижний отступ заголовка, который раньше выпадал из пустой секции наружу.
      expect(byRule('cls').map((finding) => finding.section)).toEqual(['hero-1']);
      expect(byRule('cls')[0]?.where).toMatch(/^секция выросла на 3\d\d px$/);
      expect(byRule('cls')[0]?.text).toMatch(
        /^Вёрстка прыгает при загрузке: CLS 0,\d\d при норме до 0,10, из-за этой секции/,
      );
      expect(byRule('tbt').map((finding) => finding.section)).toEqual(['slow-1']);
      expect(byRule('tbt')[0]?.where).toMatch(/^запуск 3\d\d мс$/);
      expect(byRule('lcp-lazy').map((finding) => [finding.section, finding.where])).toEqual([['top-1', 'img']]);
    } finally {
      await rendered.close();
    }
  }, 60_000);

  it('окно замера кончается меткой загрузки: задача после неё в TBT не идёт, даже если прокрутки не было', async () => {
    const rendered = await renderer.open({ html: LATE_PAGE, devices: ['mobile'] });
    try {
      const [mobile] = rendered.sessions;
      if (mobile === undefined) throw new Error('нет экрана');
      // Задача страницы начинается через 20 мс после метки и идёт 400 мс.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const raw = VitalsRaw.parse(await mobile.vitals());
      expect(raw.loadedAt).not.toBeNull();
      expect(raw.readAt - (raw.loadedAt ?? 0)).toBeGreaterThan(400);
      expect(raw.long).toEqual([]);
      expect(totalBlocking(raw)).toBe(0);
    } finally {
      await rendered.close();
    }
  }, 60_000);

  it.each([
    [true, []],
    [false, ['lcp-hidden']],
  ])(
    'баннер cookie, показан стилем платформы: %s — находки LCP %j',
    async (shownByCss, rules) => {
      const rendered = await renderer.open({ html: bannerPage(shownByCss), devices: ['mobile'] });
      try {
        const [mobile] = rendered.sessions;
        if (mobile === undefined) throw new Error('нет экрана');
        const found = vitalsFindings(await mobile.vitals(), 'mobile').filter((finding) =>
          finding.rule.startsWith('lcp-'),
        );
        expect(found.map((finding) => finding.rule)).toEqual(rules);
      } finally {
        await rendered.close();
      }
    },
    60_000,
  );

  it('Lighthouse по вкладке: находки по секциям, страница не перезагружается и снимается дальше', async () => {
    const rendered = await renderer.open({ html: LIGHTHOUSE_PAGE, devices: ['mobile'] });
    try {
      const [mobile] = rendered.sessions;
      if (mobile === undefined) throw new Error('нет экрана');
      const found = lighthouseFindings(await mobile.lighthouse(10_000));
      expect(found.map((finding) => [finding.rule, finding.section]).sort()).toEqual([
        ['crawlable-anchors', 'links-1'],
        ['paste-preventing-inputs', 'form-1'],
        ['unsized-images', 'media-1'],
      ]);
      expect(found.find((finding) => finding.rule === 'crawlable-anchors')?.where).toBe('a «Открыть каталог»');
      const shot = await mobile.shoot(0, 60);
      expect(shot[0]).toBe(0xff);
    } finally {
      await rendered.close();
    }
  }, 60_000);

  // Два снимка разом в одном браузере (так идут задания проверяющего процесса, `MAX_CONCURRENT_RENDERS`): Lighthouse
  // у обоих отрабатывает по очереди, а не падает с `lh:runner:gather`.
  it('Lighthouse на нескольких страницах разом: по очереди, все отрабатывают', async () => {
    const jobs = await Promise.all(
      [1, 2].map(() => renderer.open({ html: LIGHTHOUSE_PAGE, devices: ['mobile', 'desktop'] })),
    );
    try {
      const runs = jobs.flatMap((job) => job.sessions.map((session) => session.lighthouse(60_000)));
      const found = (await Promise.all(runs)).map((raw) => lighthouseFindings(raw).length);
      expect(found).toEqual([3, 3, 3, 3]);
    } finally {
      await Promise.all(jobs.map((job) => job.close()));
    }
  }, 120_000);

  it('не дождался очереди Lighthouse — отказ с причиной, прогон соседа не страдает', async () => {
    const rendered = await renderer.open({ html: LIGHTHOUSE_PAGE, devices: ['mobile', 'desktop'] });
    try {
      const [mobile, desktop] = rendered.sessions;
      if (mobile === undefined || desktop === undefined) throw new Error('нет экранов');
      const running = mobile.lighthouse(1_000);
      await expect(desktop.lighthouse(0)).rejects.toThrow(/очередь Lighthouse занята другим снимком/);
      expect(lighthouseFindings(await running)).toHaveLength(3);
    } finally {
      await rendered.close();
    }
  }, 60_000);
});
