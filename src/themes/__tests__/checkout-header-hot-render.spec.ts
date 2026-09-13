/**
 * Баг владельца (14.09): «При изменении цветовой схемы шапки во вкладке
 * "Оформление заказа" сбрасывается логотип».
 *
 * ЧТО ЭТО НА САМОМ ДЕЛЕ — замер, а не догадка. Пруф снят без БД и без браузера
 * (scripts, 13-14.09): одна и та же ревизия отрендерена ДВУМЯ путями превью.
 *
 *   ПЕРВИЧНЫЙ РЕНДЕР страницы (`assembleChrome` → injectCheckoutChromeIntoHtml):
 *     <img src="…/logo.png"> — ЕСТЬ, siteTitle текстом — нет;
 *   ТОЧЕЧНЫЙ HOT-RENDER (POST /preview/block, дёргается на ЛЮБУЮ правку поля
 *   панели, в том числе «Цветовая схема»):
 *     <img> — НЕТ, вместо логотипа печатается текст siteTitle, причём дефолтный
 *     («Мой магазин»), а не мерчантский.
 *
 * Обе разметки несут ОДИН `data-puck-component-id`, поэтому агент превью
 * находит шапку и подменяет её «облысевшей» версией. Данные ревизии при этом
 * ЦЕЛЫ: логотип живёт в `home.Header.props.logo` (туда его кладёт build из
 * branding), а у блока «Шапка оформления» в панели вообще нет поля логотипа —
 * `logoMode`/`logoImage`/`siteTitle` там hidden с дефолтами 'text'/null/«Мой
 * магазин». Значит теряется В РЕНДЕРЕ, а не в данных, и починка — на стыке
 * путей, а не в полях блока.
 *
 * КЛАСС БАГА, а не одно поле: точечный hot-render отдаёт блокам ХРОМА сырые
 * пропсы конструктора, тогда как первичный рендер обогащает их ревизией
 * (`assembleChrome`). Под тем же риском у «Шапки оформления» ТРИ поля —
 * `logoImage`, `logoMode`, `siteTitle`. Поэтому гард стоит на ОБЩЕМ строителе
 * пропсов (`buildCheckoutHeaderProps`), которым обязаны пользоваться оба пути,
 * а не на подстановке одного логотипа.
 *
 * Саботаж-проверки внизу: сырые пропсы блока (путь «как было») обязаны
 * остаться БЕЗ логотипа — иначе тест зелёный сам по себе и ничего не сторожит.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  assembleChrome,
  buildCheckoutHeaderProps,
  enrichChromeBlockProps,
} from '../chrome-assembler';
import { CheckoutHeaderPuckConfig } from '../../../packages/theme-base/blocks/CheckoutHeader/CheckoutHeader.puckConfig';

const SITES_ROOT = join(__dirname, '..', '..', '..');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), 'utf8');

function renderBaseBlock(block: string, props: Record<string, unknown>): string {
  const jobs = [{ block, pkg: 'theme-base', props }];
  const raw = execFileSync('node', [RENDERER, 'rose', JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as { html?: string; error?: string }[];
  if (rows[0]?.error) throw new Error(rows[0].error);
  return rows[0]?.html ?? '';
}

const LOGO = 'https://minio.merfy.ru/sites/logo-test.png';
const IMG_RE = new RegExp(`<img[^>]*src="${LOGO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);

/** Ревизия сайта: логотип бренда — в шапке главной, у чекаут-шапки его нет. */
const pagesData = () => ({
  home: {
    content: [
      { type: 'Header', props: { id: 'Header-1', siteTitle: 'Мой магазин у дома', logo: LOGO } },
    ],
  },
  'page-checkout': {
    content: [
      {
        type: 'CheckoutHeader',
        props: {
          ...CheckoutHeaderPuckConfig.defaults,
          id: 'CheckoutHeader-1',
          colorScheme: 'scheme-2',
        },
      },
    ],
  },
});

/** Пропсы, которые конструктор шлёт в POST /preview/block при смене схемы. */
const livePanelProps = (scheme: string) => ({
  ...CheckoutHeaderPuckConfig.defaults,
  id: 'CheckoutHeader-1',
  colorScheme: scheme,
});

// ── 1. Общий строитель пропсов шапки чекаута ───────────────────────────────

describe('пропсы «Шапки оформления» собирает ОДИН строитель', () => {
  it('первичный путь: логотип и название берутся из шапки главной', () => {
    const props = buildCheckoutHeaderProps(pagesData());
    expect(props.logoMode).toBe('image');
    expect(props.logoImage).toBe(LOGO);
    expect(props.siteTitle).toBe('Мой магазин у дома');
  });

  it('живая правка панели ПОБЕЖДАЕТ сохранённую ревизию', () => {
    const props = buildCheckoutHeaderProps(pagesData(), livePanelProps('scheme-4'));
    expect(props.colorScheme).toBe('scheme-4');
  });

  it('но логотип и название всё равно приезжают из ревизии', () => {
    const props = buildCheckoutHeaderProps(pagesData(), livePanelProps('scheme-4'));
    expect(props.logoMode).toBe('image');
    expect(props.logoImage).toBe(LOGO);
    expect(props.siteTitle).toBe('Мой магазин у дома');
  });

  it('puck-id сохраняется — иначе следующая правка не найдёт шапку', () => {
    const props = buildCheckoutHeaderProps(pagesData(), livePanelProps('scheme-3'));
    expect(props.id).toBe('CheckoutHeader-1');
  });

  it('логотипа в ревизии нет → остаётся текстовый режим (не выдумываем картинку)', () => {
    const data = pagesData();
    data.home.content[0].props = { id: 'Header-1', siteTitle: 'Без логотипа' } as never;
    const props = buildCheckoutHeaderProps(data, livePanelProps('scheme-3'));
    expect(props.logoMode).toBe('text');
    expect(props.siteTitle).toBe('Без логотипа');
  });
});

// ── 2. Класс бага: обогащение хрома на точечном hot-render ─────────────────

describe('точечный hot-render обогащает блоки хрома', () => {
  it('CheckoutHeader — обогащается', () => {
    const out = enrichChromeBlockProps(
      'CheckoutHeader',
      pagesData(),
      livePanelProps('scheme-4'),
    );
    expect(out).not.toBeNull();
    expect(out?.logoImage).toBe(LOGO);
    expect(out?.colorScheme).toBe('scheme-4');
  });

  it('САБОТАЖ: обычная секция не трогается (null → контроллер её не патчит)', () => {
    expect(enrichChromeBlockProps('Hero', pagesData(), { id: 'Hero-1' })).toBeNull();
    expect(enrichChromeBlockProps('CheckoutForm', pagesData(), { id: 'F-1' })).toBeNull();
  });

  it('ревизии нет (старый сайт) — падать нельзя, отдаём дефолты блока', () => {
    const out = enrichChromeBlockProps('CheckoutHeader', {}, livePanelProps('scheme-3'));
    expect(out?.colorScheme).toBe('scheme-3');
    expect(out?.logoMode).toBe('text');
  });
});

// ── 3. Рендер: та самая разметка, которой агент подменяет шапку ────────────

describe('разметка шапки после правки схемы', () => {
  it('ПЕРВИЧНЫЙ РЕНДЕР: логотип на месте', async () => {
    const chrome = await assembleChrome({
      pagesData: pagesData(),
      theme: 'rose',
      chrome: 'checkout',
      renderBlock: ({ blockName, props }) =>
        Promise.resolve(renderBaseBlock(blockName, props as Record<string, unknown>)),
      isPreview: true,
    });
    expect(chrome.headerHtml ?? '').toMatch(IMG_RE);
  });

  it('HOT-RENDER через общий строитель: логотип на месте И схема сменилась', () => {
    const props = buildCheckoutHeaderProps(pagesData(), livePanelProps('scheme-4'));
    const html = renderBaseBlock('CheckoutHeader', props);
    expect(html).toMatch(IMG_RE);
    expect(html).toMatch(/color-scheme-4/);
    expect(html).toMatch(/data-puck-component-id="CheckoutHeader-1"/);
  });

  it('САБОТАЖ: сырые пропсы панели (путь «как было») логотип ТЕРЯЮТ', () => {
    const html = renderBaseBlock('CheckoutHeader', livePanelProps('scheme-4'));
    expect(html).not.toMatch(IMG_RE);
    expect(html).toContain('Мой магазин');
  });
});

// ── 4. Разводка: оба пути обязаны звать общий код ──────────────────────────
//
// Без этих двух проверок починка живёт ровно до следующей правки контроллера:
// класс бага в том и состоит, что у первичного рендера и точечного был СВОЙ
// сбор пропсов.

describe('оба пути идут через общий код', () => {
  it('сборка хрома зовёт общий строитель', () => {
    expect(read('src/themes/chrome-assembler.ts')).toMatch(
      /checkoutProps\s*=\s*buildCheckoutHeaderProps\(/,
    );
  });

  it('контроллер точечного рендера зовёт общее обогащение', () => {
    const src = read('src/controllers/preview.controller.ts');
    expect(src).toContain('enrichChromeBlockProps');
  });

  it('второй копии сбора пропсов шапки в контроллере нет', () => {
    // Комментарии выбрасываем: объяснение бага упоминает поля по именам, а
    // сторожим мы КОД — чтобы починку не «дополнили» ещё одной копией сборки.
    const code = read('src/controllers/preview.controller.ts')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/logoImage/);
    expect(code).not.toMatch(/logoMode/);
  });
});
