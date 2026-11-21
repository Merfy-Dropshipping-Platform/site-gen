import { OVERLAY_HIDE_EVENT, OVERLAY_SHOW_EVENT } from '@merfy/shell/preview';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Метки проверок в превью (этап 5 «Проверки в окне», Ч5) в настоящем Chromium: сообщение
// set-check-marks { marks: [{ sectionId, items: [{ title, text? }] }] } — янтарный значок с числом находок в правом
// верхнем углу секции (data-merfy-check-mark > data-merfy-check-badge + data-merfy-check-list); клик по значку открывает и
// закрывает список находок (текст — только textContent); метка идёт за секцией (scroll, resize, замена update-block),
// живёт и на окне поверх страницы; marks: [] снимает все; рамки выбора и Визи остаются как были.
interface Message {
  type: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    received: Message[];
    send: (message: unknown) => void;
    hacked?: number;
  }
}

const ORIGIN = 'http://preview.test';
const FRAME = `${ORIGIN}/api/sites/s1/preview`;
const HEIGHT = 400;
const section = (id: string, text: string): string =>
  `<merfy-section data-section="shop:hero" data-section-id="${id}" class="py-section" style="display:block;height:${HEIGHT}px"><h2>${text}</h2></merfy-section>`;
// Окно поверх страницы, как его раскладывает ядро (parts/overlay.ts): слой на весь экран в верхнем слое страницы, окно —
// корень шаблона по центру. Ядра здесь нет — «открыть окно» делает тот же showPopover (образец — preview-sections-overlay).
const LAYER_CSS = `merfy-section[data-overlay]{position:fixed;inset:0;margin:0;border:0;padding:16px;background:transparent;
width:auto;height:auto;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
merfy-section[data-overlay]:popover-open{display:flex}
merfy-section[data-overlay] > *{pointer-events:auto}`;
const LAYER = `document.addEventListener('${OVERLAY_SHOW_EVENT}', function (event) {
  var host = event.target;
  host.setAttribute('popover', 'manual');
  host.hidden = false;
  if (!host.matches(':popover-open')) host.showPopover();
}, true);
document.addEventListener('${OVERLAY_HIDE_EVENT}', function (event) {
  if (event.target.matches(':popover-open')) event.target.hidePopover();
  event.target.hidden = true;
}, true);`;
const WINDOW_HTML = `<merfy-section data-section="shop:window" data-section-id="window-1" data-overlay hidden><div data-root style="width:448px;height:200px"><h2>Окно</h2></div></merfy-section>`;
const FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>${LAYER_CSS}</style><script>${LAYER}</script></head><body style="margin:0;padding-top:60px"><main>${section('near-1', 'Первый')}${section('near-2', 'Второй')}${section('far-1', 'Далёкий')}</main>${WINDOW_HTML}<script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:800px"></iframe><script>
window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

const blockSchema = z.object({ instance: z.object({ id: z.string() }) });

let browser: Browser;
let page: Page;

const received = (): Promise<Message[]> => page.evaluate(() => window.received);
const countOf = async (type: string): Promise<number> =>
  (await received()).filter((message) => message.type === type).length;
const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const frame = () => page.frameLocator('#preview');
const markOf = (sectionId: string) => frame().locator(`[data-merfy-check-mark="${sectionId}"]`);
const badgeOf = (sectionId: string) => markOf(sectionId).locator('[data-merfy-check-badge]');
const listOf = (sectionId: string) => markOf(sectionId).locator('[data-merfy-check-list]');
const marks = (value: unknown): Promise<void> => send({ type: 'set-check-marks', marks: value });
const markCount = (): Promise<number> => frame().locator('[data-merfy-check-mark]').count();
// Отступ значка от правого верхнего угла секции (корня окна — для окна поверх страницы); «правый верхний угол + 8 px».
const cornerOf = async (sectionId: string, rootSelector = ''): Promise<{ right: number; top: number } | null> => {
  const badge = await badgeOf(sectionId).boundingBox();
  const target = await frame().locator(`[data-section-id="${sectionId}"]${rootSelector}`).boundingBox();
  return badge && target
    ? { right: Math.round(target.x + target.width - (badge.x + badge.width)), top: Math.round(badge.y - target.y) }
    : null;
};
const CORNER = { right: 8, top: 8 };
const resizePreview = (width: number, height: number): Promise<void> =>
  page.evaluate(
    ([w, h]) => {
      const preview = document.getElementById('preview');
      if (preview) preview.style.cssText = `width:${w}px;height:${h}px`;
    },
    [width, height],
  );

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) => route.fulfill({ contentType: 'text/html', body: PARENT_HTML }));
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML }));
  await page.route(`${FRAME}/block`, async (route) => {
    const { instance } = blockSchema.parse(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ html: section(instance.id, 'Заменён'), css: '' }),
    });
  });
  await page.goto(`${ORIGIN}/parent`);
  // expect.poll вне теста vitest не позволяет — тот же опрос циклом.
  for (let attempt = 0; attempt < 200 && (await countOf('ready')) === 0; attempt++) await page.waitForTimeout(50);
  await send({ type: 'init' });
  await send({ type: 'set-labels', componentLabels: { 'shop:hero': 'Первый экран' }, subsectionItemLabels: {} });
});

afterAll(async () => {
  await browser.close();
});

describe('метки проверок в превью (set-check-marks)', () => {
  it('до сообщения меток нет; после — янтарный значок с числом находок в правом верхнем углу секции', async () => {
    expect(await markCount()).toBe(0);
    await marks([
      {
        sectionId: 'near-2',
        items: [{ title: 'Нет подписи у картинки', text: 'Добавлю alt' }, { title: 'Мелкий текст' }],
      },
    ]);
    await expect.poll(() => badgeOf('near-2').textContent()).toBe('2');
    expect(await badgeOf('near-2').evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
      'rgb(245, 158, 11)',
    );
    await expect.poll(() => cornerOf('near-2')).toEqual(CORNER);
    expect(await markCount()).toBe(1);
  });

  it('клик по значку открывает список находок секции, второй клик — закрывает; секцию клик не выбирает', async () => {
    expect(await listOf('near-2').isVisible()).toBe(false);
    await badgeOf('near-2').click();
    await expect.poll(() => listOf('near-2').isVisible()).toBe(true);
    expect(await badgeOf('near-2').getAttribute('aria-expanded')).toBe('true');
    expect(await listOf('near-2').locator('[data-merfy-check-item]').count()).toBe(2);
    expect(await listOf('near-2').locator('[data-merfy-check-title]').allTextContents()).toEqual([
      'Нет подписи у картинки',
      'Мелкий текст',
    ]);
    // Текст — только у первой находки.
    expect(await listOf('near-2').locator('[data-merfy-check-text]').allTextContents()).toEqual(['Добавлю alt']);
    await listOf('near-2').locator('[data-merfy-check-title]').first().click();
    expect(await listOf('near-2').isVisible()).toBe(true);
    await badgeOf('near-2').click();
    await expect.poll(() => listOf('near-2').isVisible()).toBe(false);
    expect(await badgeOf('near-2').getAttribute('aria-expanded')).toBe('false');
    expect(await countOf('select-block')).toBe(0);
  });

  it('текст с HTML показывается как текст: ни разметки, ни выполнения', async () => {
    await marks([
      {
        sectionId: 'near-2',
        items: [
          {
            title: '<img src=x onerror="window.hacked=1">Заголовок',
            text: '<b>жирный</b> <script>window.hacked=2</script>',
          },
        ],
      },
    ]);
    await expect.poll(() => badgeOf('near-2').textContent()).toBe('1');
    await badgeOf('near-2').click();
    await expect.poll(() => listOf('near-2').isVisible()).toBe(true);
    expect(await listOf('near-2').locator('[data-merfy-check-title]').textContent()).toBe(
      '<img src=x onerror="window.hacked=1">Заголовок',
    );
    expect(await listOf('near-2').locator('[data-merfy-check-text]').textContent()).toBe(
      '<b>жирный</b> <script>window.hacked=2</script>',
    );
    expect(await listOf('near-2').locator('img, b, script').count()).toBe(0);
    await page.waitForTimeout(100);
    expect(
      await frame()
        .locator('body')
        .evaluate(() => window.hacked),
    ).toBeUndefined();
  });

  it('новое сообщение пересобирает метку: число и находки новые, открытый список остаётся открытым', async () => {
    await marks([{ sectionId: 'near-2', items: [{ title: 'Первая' }, { title: 'Вторая' }, { title: 'Третья' }] }]);
    await expect.poll(() => badgeOf('near-2').textContent()).toBe('3');
    expect(await listOf('near-2').isVisible()).toBe(true);
    expect(await listOf('near-2').locator('[data-merfy-check-title]').allTextContents()).toEqual([
      'Первая',
      'Вторая',
      'Третья',
    ]);
  });

  it('метки на нескольких секциях; кривые находки и секции выпадают, неизвестная секция — метки не видно', async () => {
    await marks([
      { sectionId: 'near-1', items: [{ title: 'Одна' }, { title: '' }, { text: 'без заголовка' }, null, 5] },
      { sectionId: 'near-2', items: [{ title: 'Раз' }] },
      { sectionId: 'нет-такой', items: [{ title: 'Нигде' }] },
      { sectionId: '"] [x', items: [{ title: 'Кривой id' }] },
      { sectionId: 'constructor', items: [{ title: 'Служебное имя' }] },
      { sectionId: 'far-1', items: [] },
      { sectionId: '', items: [{ title: 'Без id' }] },
      { sectionId: 'far-1' },
      null,
      'строка',
    ]);
    await expect.poll(() => badgeOf('near-1').textContent()).toBe('1');
    expect(await badgeOf('near-2').textContent()).toBe('1');
    expect(await markOf('far-1').count()).toBe(0);
    expect(await markOf('нет-такой').isVisible()).toBe(false);
    expect(await markOf('constructor').isVisible()).toBe(false);
    await expect.poll(() => cornerOf('near-1')).toEqual(CORNER);
    await expect.poll(() => cornerOf('near-2')).toEqual(CORNER);
  });

  it('не массив в marks — сообщение пропущено, метки прежние; незнакомый тип молча пропущен', async () => {
    await marks('все');
    await marks(null);
    await send({ type: 'set-check-marks' });
    await send({ type: 'constructor' });
    await page.waitForTimeout(100);
    expect(await badgeOf('near-1').textContent()).toBe('1');
    // В странице — слои только у секций, что есть на ней (near-1 и near-2): остальные ждут свою секцию.
    expect(await markCount()).toBe(2);
  });

  it('marks: [] снимает все метки', async () => {
    await marks([]);
    await expect.poll(markCount).toBe(0);
    await marks([{ sectionId: 'near-1', items: [{ title: 'Вернулась' }] }]);
    await expect.poll(markCount).toBe(1);
    await marks([]);
    await expect.poll(markCount).toBe(0);
  });

  it('метка идёт за секцией: прокрутка страницы и смена размера окна', async () => {
    await marks([{ sectionId: 'far-1', items: [{ title: 'Далеко' }, { title: 'Ещё' }] }]);
    await expect.poll(() => badgeOf('far-1').textContent()).toBe('2');
    await frame()
      .locator('[data-section-id="far-1"]')
      .evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await expect.poll(() => cornerOf('far-1')).toEqual(CORNER);
    await frame()
      .locator('body')
      .evaluate(() => window.scrollBy(0, -150));
    await expect.poll(() => cornerOf('far-1')).toEqual(CORNER);
    // Окно превью — iframe: размер ему меняет родитель, и скрипт получает resize.
    await resizePreview(900, 700);
    await expect.poll(() => cornerOf('far-1')).toEqual(CORNER);
    // Секция выше — метка ниже вместе с ней: пересчёт по resize идёт за секцией.
    await frame()
      .locator('[data-section-id="near-1"]')
      .evaluate((node) => node.setAttribute('style', 'display:block;height:520px'));
    await resizePreview(1000, 700);
    await expect.poll(() => cornerOf('far-1')).toEqual(CORNER);
    await resizePreview(1200, 800);
    await marks([]);
  });

  it('переживает update-block своей секции: секция заменена, метка на новой, список остался открытым', async () => {
    await marks([{ sectionId: 'near-2', items: [{ title: 'Переживёт' }] }]);
    await expect.poll(() => badgeOf('near-2').textContent()).toBe('1');
    await badgeOf('near-2').click();
    await expect.poll(() => listOf('near-2').isVisible()).toBe(true);
    await send({
      type: 'update-block',
      pageId: 'home',
      blockId: 'near-2',
      blockType: 'shop:hero',
      props: { id: 'near-2', settings: {} },
    });
    await expect.poll(() => frame().locator('[data-section-id="near-2"] h2').textContent()).toBe('Заменён');
    await expect.poll(() => markOf('near-2').isVisible()).toBe(true);
    await expect.poll(() => cornerOf('near-2')).toEqual(CORNER);
    expect(await listOf('near-2').isVisible()).toBe(true);
    expect(await markCount()).toBe(1);
    await marks([]);
  });

  it('секции нет на странице — метки не видно; секция встала (merfy:preview:updated) — метка на ней', async () => {
    await marks([{ sectionId: 'new-1', items: [{ title: 'Новая' }] }]);
    await page.waitForTimeout(150);
    expect(await markOf('new-1').isVisible()).toBe(false);
    await frame()
      .locator('main')
      .evaluate((main, html) => main.insertAdjacentHTML('beforeend', html), section('new-1', 'Новый'));
    await frame()
      .locator('body')
      .evaluate(() => document.dispatchEvent(new CustomEvent('merfy:preview:updated', { detail: { id: 'new-1' } })));
    await expect.poll(() => badgeOf('new-1').isVisible()).toBe(true);
    await expect.poll(() => cornerOf('new-1')).toEqual(CORNER);
    await marks([]);
  });

  it('окно поверх страницы: метка в слое окна, в правом верхнем углу его корня; список открывается кликом', async () => {
    await send({ type: 'set-selection', sectionId: 'window-1', actions: {} });
    await expect.poll(() => frame().locator('#merfy-selection').isVisible()).toBe(true);
    await marks([{ sectionId: 'window-1', items: [{ title: 'В окне', text: 'Подробнее' }] }]);
    await expect.poll(() => badgeOf('window-1').isVisible()).toBe(true);
    expect(await markOf('window-1').evaluate((node) => node.parentElement?.getAttribute('data-section-id'))).toBe(
      'window-1',
    );
    await expect.poll(() => cornerOf('window-1', ' > [data-root]')).toEqual(CORNER);
    // Слой метки не перехватывает клики окна, значок — нажимается.
    expect(await markOf('window-1').evaluate((node) => getComputedStyle(node).pointerEvents)).toBe('none');
    await badgeOf('window-1').click();
    await expect.poll(() => listOf('window-1').isVisible()).toBe(true);
    expect(await listOf('window-1').locator('[data-merfy-check-text]').textContent()).toBe('Подробнее');
    await badgeOf('window-1').click();
    await expect.poll(() => listOf('window-1').isVisible()).toBe(false);
    // Рамка выбора окна по-прежнему вокруг корня окна, «Удалить» нажимается.
    const selection = await frame().locator('#merfy-selection').boundingBox();
    const root = await frame().locator('[data-section-id="window-1"] > [data-root]').boundingBox();
    expect(selection && root ? [Math.round(selection.x - root.x), Math.round(selection.y - root.y)] : null).toEqual([
      0, 0,
    ]);
    await frame().locator('#merfy-selection [data-merfy-delete]').click();
    await expect.poll(async () => (await received()).at(-1)).toEqual({ type: 'delete-block', blockId: 'window-1' });
    await marks([]);
    await send({ type: 'set-selection', sectionId: null, actions: {} });
  });

  it('рамки выбора и Визи на месте рядом с метками: клик по значку секцию не выбирает, клик по секции — выбирает', async () => {
    await send({ type: 'set-selection', sectionId: 'near-1', sectionType: 'shop:hero', cookieBanner: false });
    await send({ type: 'set-agent-frame', sectionId: 'near-2', label: 'Баннер' });
    await marks([
      { sectionId: 'near-1', items: [{ title: 'У выбранной' }] },
      { sectionId: 'near-2', items: [{ title: 'У Визи' }, { title: 'Ещё' }] },
    ]);
    await expect.poll(() => badgeOf('near-2').textContent()).toBe('2');
    await expect
      .poll(() => frame().locator('#merfy-agent-frame [data-merfy-agent-label]').textContent())
      .toBe('Визи · Баннер');
    const offset = async (selector: string, sectionId: string) => {
      const box = await frame().locator(selector).boundingBox();
      const target = await frame().locator(`[data-section-id="${sectionId}"]`).boundingBox();
      return box && target ? { x: Math.round(box.x - target.x), y: Math.round(box.y - target.y) } : null;
    };
    await expect.poll(() => offset('#merfy-selection', 'near-1')).toEqual({ x: 0, y: 0 });
    await expect.poll(() => offset('#merfy-agent-frame', 'near-2')).toEqual({ x: 0, y: 0 });
    // Значок лежит под рамкой Визи, но рамка кликов не ловит: список открывается.
    await badgeOf('near-2').click();
    await expect.poll(() => listOf('near-2').isVisible()).toBe(true);
    await badgeOf('near-1').click();
    await expect.poll(() => listOf('near-1').isVisible()).toBe(true);
    expect(await countOf('select-block')).toBe(0);
    // Клик по самой секции — выбор, как раньше.
    await frame().locator('[data-section-id="near-2"] h2').click();
    await expect.poll(() => countOf('select-block')).toBe(1);
    expect((await received()).filter((message) => message.type === 'select-block')[0]).toEqual({
      type: 'select-block',
      blockId: 'near-2',
    });
    // Метки сняты — обе рамки остались.
    await marks([]);
    await expect.poll(markCount).toBe(0);
    expect(await frame().locator('#merfy-selection').isVisible()).toBe(true);
    expect(await frame().locator('#merfy-agent-frame').isVisible()).toBe(true);
  });
});
