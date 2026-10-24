import { PREVIEW_UPDATE_EVENT, PREVIEW_UPDATED_EVENT, SECTION_ERROR_EVENT } from '@merfy/shell/preview';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Код секций в превью (блок 5 «Секций и SDK», часть 5г, Р5г-14…Р5г-16) в настоящем Chromium: правка секции с кодом —
// событие merfy:preview:update скрипту превью; рамка выбора — по merfy:preview:updated; сбой скрипта — красная рамка и
// подпись; кнопки секции — коду секции, без выбора. Скрипт превью здесь подставной: пишет события в window.updates,
// берёт себе правки с кодом (script не null), считает нажатия [data-action] в window.clicks.
interface Message {
  type: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    received: Message[];
    send: (message: unknown) => void;
  }
}

const ORIGIN = 'http://preview.test';
const FRAME = `${ORIGIN}/api/sites/s1/preview`;
const SCRIPT = { hash: 'a'.repeat(64), code: 'export default {};', uses: [] };
const scarf = (id: string, heading: string): string =>
  `<merfy-section data-section="shop:scarf-match" data-section-id="${id}" class="py-section"><div>` +
  `<h2>${heading}</h2><button type="button" data-action="pick">Серое</button>` +
  '<a href="/o-nas"><button type="button">О нас</button></a></div></merfy-section>';
const FAKE_PREVIEW =
  'window.updates = []; window.clicks = 0;' +
  `document.addEventListener(${JSON.stringify(PREVIEW_UPDATE_EVENT)}, function (event) {` +
  " window.updates.push({ id: event.target.getAttribute('data-section-id'), detail: event.detail });" +
  ' if (event.detail.script) event.preventDefault(); });' +
  "document.addEventListener('click', function (event) { if (event.target.closest('[data-action]')) window.clicks += 1; });";
const FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>merfy-section{display:block}</style></head><body style="margin:0;padding-top:60px"><main>${scarf('scarf-1', 'Подбор')}</main><script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script><script>${FAKE_PREVIEW}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:800px"></iframe><script>
window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

let browser: Browser;
let page: Page;
let answer: Record<string, unknown> = { html: scarf('scarf-1', 'Новый'), css: '', script: SCRIPT };

const received = (): Promise<Message[]> => page.evaluate(() => window.received);
const lastOf = async (type: string): Promise<Message | undefined> =>
  (await received()).filter((message) => message.type === type).at(-1);
const countOf = async (type: string): Promise<number> =>
  (await received()).filter((message) => message.type === type).length;
const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const frame = () => page.frameLocator('#preview');
const section = (id: string) => frame().locator(`[data-section-id="${id}"]`);
const updates = (): Promise<unknown> =>
  frame()
    .locator('body')
    .evaluate((): unknown => Reflect.get(window, 'updates'));
const update = (): Promise<void> =>
  send({
    type: 'update-block',
    blockId: 'scarf-1',
    blockType: 'shop:scarf-match',
    props: { id: 'scarf-1', settings: {} },
  });
const fire = (name: string, detail: unknown): Promise<void> =>
  frame()
    .locator('body')
    .evaluate(
      (_body, event) => {
        document.dispatchEvent(new CustomEvent(event.name, { detail: event.detail }));
      },
      { name, detail },
    );

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) => route.fulfill({ contentType: 'text/html', body: PARENT_HTML }));
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML }));
  await page.route(`${FRAME}/block`, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(answer) }),
  );
  await page.goto(`${ORIGIN}/parent`);
  // expect.poll вне теста vitest не позволяет — тот же опрос циклом.
  for (let attempt = 0; attempt < 200 && (await countOf('ready')) === 0; attempt++) await page.waitForTimeout(50);
  await send({ type: 'init' });
});

afterAll(async () => {
  await browser.close();
});

describe('код секций в превью', () => {
  it('ответ с script — правка уходит скрипту превью событием; узел секции тот же, HTML прежний', async () => {
    await section('scarf-1').evaluate((node) => node.setAttribute('data-test-mark', ''));
    await update();
    await expect
      .poll(updates)
      .toEqual([{ id: 'scarf-1', detail: { html: scarf('scarf-1', 'Новый'), script: SCRIPT, codeOnly: false } }]);
    expect(await section('scarf-1').getAttribute('data-test-mark')).toBe('');
    expect(await section('scarf-1').locator('h2').textContent()).toBe('Подбор');
  });

  it('ответ без script (сборщик до 5г) — события нет, секцию меняет скрипт секций превью', async () => {
    answer = { html: scarf('scarf-1', 'Старый ответ'), css: '' };
    await update();
    await expect.poll(() => section('scarf-1').locator('h2').textContent()).toBe('Старый ответ');
    expect(await updates()).toHaveLength(1);
  });

  it('script: null — событие уходит; его не отменили — секцию меняет скрипт секций превью', async () => {
    answer = { html: scarf('scarf-1', 'Без кода'), css: '', script: null };
    await update();
    await expect.poll(() => section('scarf-1').locator('h2').textContent()).toBe('Без кода');
    expect(await updates()).toMatchObject([{}, { id: 'scarf-1', detail: { script: null, codeOnly: false } }]);
  });

  it('reconcile — вставленной секции та же правка с codeOnly: true', async () => {
    answer = { html: scarf('scarf-2', 'Вторая'), css: '', script: SCRIPT };
    await send({
      type: 'reconcile',
      version: 1,
      blocks: [
        { id: 'scarf-1', type: 'shop:scarf-match', propsHash: 'h1', props: { id: 'scarf-1', settings: {} } },
        { id: 'scarf-2', type: 'shop:scarf-match', propsHash: 'h2', props: { id: 'scarf-2', settings: {} } },
      ],
    });
    await expect
      .poll(() => lastOf('reconcile-ack'))
      .toEqual({ type: 'reconcile-ack', version: 1, ok: true, applied: 1 });
    expect(await updates()).toMatchObject([
      {},
      {},
      { id: 'scarf-2', detail: { html: scarf('scarf-2', 'Вторая'), script: SCRIPT, codeOnly: true } },
    ]);
    expect(await section('scarf-2').locator('h2').textContent()).toBe('Вторая');
  });

  it('merfy:preview:updated — рамка выбора по новому размеру секции', async () => {
    await send({
      type: 'set-selection',
      sectionId: 'scarf-1',
      sectionType: 'shop:scarf-match',
      subsectionParentId: null,
      subsectionIndex: null,
      cookieBanner: false,
    });
    const selection = frame().locator('#merfy-selection');
    await expect.poll(() => selection.evaluate((node) => getComputedStyle(node).display)).toBe('block');
    await section('scarf-1').evaluate((node) => {
      node.style.height = '400px';
    });
    await fire(PREVIEW_UPDATED_EVENT, { id: 'scarf-1', outcome: 'kept-state', message: '' });
    await expect.poll(() => selection.evaluate((node) => node.style.height)).toBe('400px');
  });

  it('сбой скрипта — красная рамка и подпись с названием из set-labels; повтор — одна подпись; сбой при снятии — без подписи', async () => {
    await send({ type: 'set-labels', componentLabels: { 'shop:scarf-match': 'Подбор шарфа' } });
    await expect.poll(() => frame().locator('#merfy-selection [data-merfy-name]').textContent()).toBe('Подбор шарфа');
    const failure = {
      section: 'shop:scarf-match',
      id: 'scarf-1',
      script: SCRIPT.hash,
      stage: 'mount',
      message: 'нет шарфов',
    };
    await section('scarf-1').evaluate((node) => node.setAttribute('data-merfy-state', 'failed'));
    await fire(SECTION_ERROR_EVENT, failure);
    const note = section('scarf-1').locator('[data-merfy-script-error]');
    await expect.poll(() => note.textContent()).toBe('Ошибка в скрипте секции «Подбор шарфа»: нет шарфов');
    expect(
      await section('scarf-1').evaluate((node) => node.firstElementChild?.hasAttribute('data-merfy-script-error')),
    ).toBe(true);
    expect(await section('scarf-1').evaluate((node) => getComputedStyle(node).outlineColor)).toBe('rgb(220, 38, 38)');
    await fire(SECTION_ERROR_EVENT, { ...failure, message: 'снова' });
    await expect.poll(() => note.textContent()).toBe('Ошибка в скрипте секции «Подбор шарфа»: снова');
    expect(await note.count()).toBe(1);
    await fire(SECTION_ERROR_EVENT, { ...failure, id: 'scarf-2', stage: 'unmount' });
    expect(await section('scarf-2').locator('[data-merfy-script-error]').count()).toBe(0);
  });

  it('кнопка секции — нажатие коду секции, выбора нет; заголовок — select-block; кнопка в ссылке — как ссылка', async () => {
    const selects = await countOf('select-block');
    await section('scarf-1').getByText('Серое').click();
    await expect
      .poll(() =>
        frame()
          .locator('body')
          .evaluate((): unknown => Reflect.get(window, 'clicks')),
      )
      .toBe(1);
    expect(await countOf('select-block')).toBe(selects);
    await section('scarf-1').locator('h2').click();
    await expect.poll(() => countOf('select-block')).toBe(selects + 1);
    await section('scarf-1').getByText('О нас').click();
    await expect.poll(() => lastOf('navigate')).toEqual({ type: 'navigate', path: '/o-nas' });
    expect(await countOf('select-block')).toBe(selects + 2);
  });
});
