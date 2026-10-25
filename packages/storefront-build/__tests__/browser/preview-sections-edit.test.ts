import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Правка текста в превью (блок 1 «Секций и SDK», часть 6, Р1-6-7, Р1-6-8) в настоящем Chromium: contenteditable у
// элементов с data-merfy-edit и data-merfy-edit-html, первый клик ставит курсор, edit-field уходит при уходе с элемента, секция
// с курсором не заменяется.
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
const pageSection = (heading: string): string =>
  '<merfy-section data-section="shop:page" data-section-id="page-1" class="py-section">' +
  `<h1 data-merfy-edit="heading" data-merfy-placeholder="Заголовок">${heading}</h1>` +
  '<div data-merfy-edit-html="text" data-merfy-placeholder="Текст"><p>Мы шьём пледы</p></div>' +
  '<p>Подпись без правки</p></merfy-section>';
const FAQ =
  '<merfy-section data-section="shop:faq" data-section-id="faq-1" class="py-section"><div data-merfy-block="question-1">' +
  '<h3 data-merfy-edit="blocks/question-1/question" data-merfy-placeholder="Вопрос">Как стирать?</h3></div></merfy-section>';
const HERO =
  '<merfy-section data-section="shop:hero" data-section-id="hero-1" class="py-section"><h2>Первый</h2></merfy-section>';
const FRAME_HTML = (heading: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding-top:60px"><main>${pageSection(heading)}${FAQ}${HERO}</main><script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:900px"></iframe><script>
window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

let browser: Browser;
let page: Page;
let answerHeading = 'О нас';
const bodies: unknown[] = [];

const received = (): Promise<Message[]> => page.evaluate(() => window.received);
const lastOf = async (type: string): Promise<Message | undefined> =>
  (await received()).filter((message) => message.type === type).at(-1);
const countOf = async (type: string): Promise<number> =>
  (await received()).filter((message) => message.type === type).length;
const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const frame = () => page.frameLocator('#preview');
const heading = () => frame().locator('[data-section-id="page-1"] h1');
const hero = () => frame().locator('[data-section-id="hero-1"] h2');
const focused = (selector: string): Promise<boolean> =>
  frame()
    .locator(selector)
    .evaluate((node) => node.ownerDocument.activeElement === node);
const updateHeading = (): Promise<void> =>
  send({ type: 'update-block', blockId: 'page-1', blockType: 'shop:page', props: { id: 'page-1', settings: {} } });

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) => route.fulfill({ contentType: 'text/html', body: PARENT_HTML }));
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML('О нас') }));
  await page.route(`${FRAME}/block`, (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ html: pageSection(answerHeading), css: '' }),
    });
  });
});

beforeEach(async () => {
  answerHeading = 'О нас';
  bodies.length = 0;
  await page.goto(`${ORIGIN}/parent`);
  // expect.poll вне теста vitest не позволяет — тот же опрос циклом.
  for (let attempt = 0; attempt < 200 && (await countOf('ready')) === 0; attempt++) await page.waitForTimeout(50);
  await send({ type: 'init' });
});

afterAll(async () => {
  await browser.close();
});

describe('правка текста в превью', () => {
  it('contenteditable — у элементов с data-merfy-edit и data-merfy-edit-html, у остальных нет', async () => {
    await expect.poll(() => frame().locator('[contenteditable="true"]').count()).toBe(3);
    expect(await hero().getAttribute('contenteditable')).toBeNull();
    // Поправка 25.10, 11:05: в секции два <p> (внутри richtext и подпись) — строгий локатор читает подпись по тексту.
    expect(
      await frame()
        .locator('[data-section-id="page-1"] > p', { hasText: 'Подпись без правки' })
        .getAttribute('contenteditable'),
    ).toBeNull();
  });

  it('первый клик ставит курсор и выбирает секцию; набор и уход с элемента — edit-field с путём и текстом', async () => {
    await heading().click();
    await expect.poll(() => focused('[data-section-id="page-1"] h1')).toBe(true);
    await expect.poll(() => lastOf('select-block')).toEqual({ type: 'select-block', blockId: 'page-1' });
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    expect(await countOf('edit-field')).toBe(0);
    await hero().click();
    await expect
      .poll(() => lastOf('edit-field'))
      .toEqual({ type: 'edit-field', blockId: 'page-1', field: 'heading', value: 'О нас!' });
  });

  it('уход без правки — сообщения нет', async () => {
    await heading().click();
    await hero().click();
    await page.waitForTimeout(300);
    expect(await countOf('edit-field')).toBe(0);
  });

  it('richtext — innerHTML, field — путь настройки', async () => {
    await frame().locator('[data-merfy-edit-html="text"]').click();
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    await hero().click();
    await expect
      .poll(() => lastOf('edit-field'))
      .toEqual({ type: 'edit-field', blockId: 'page-1', field: 'text', value: '<p>Мы шьём пледыx</p>' });
  });

  it('настройка блока — путь blocks/<id>/<id>; клик по блоку выбирает подпункт', async () => {
    await frame().locator('h3').click();
    await expect.poll(() => lastOf('select-subsection')).toMatchObject({ parentId: 'faq-1', index: 0 });
    await page.keyboard.press('End');
    await page.keyboard.type('?');
    await hero().click();
    await expect
      .poll(() => lastOf('edit-field'))
      .toEqual({ type: 'edit-field', blockId: 'faq-1', field: 'blocks/question-1/question', value: 'Как стирать??' });
  });

  it('string и text — без пробелов по краям', async () => {
    await heading().evaluate((node) => {
      const element = node as HTMLElement;
      element.focus();
      element.textContent = '  Новый  ';
      element.blur();
    });
    await expect.poll(() => lastOf('edit-field')).toMatchObject({ field: 'heading', value: 'Новый' });
  });

  it('Enter и Esc не обрабатываются: курсор остаётся, сообщений нет', async () => {
    await heading().click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    expect(await focused('[data-section-id="page-1"] h1')).toBe(true);
    expect(await countOf('edit-field')).toBe(0);
  });

  it('update-block, пока курсор в элементе, секцию не заменяет; ушёл без правки — ответ применяется', async () => {
    answerHeading = 'С сервера';
    await heading().click();
    await updateHeading();
    await expect.poll(() => bodies.length).toBe(1);
    await page.waitForTimeout(200);
    expect(await heading().textContent()).toBe('О нас');
    expect(await focused('[data-section-id="page-1"] h1')).toBe(true);
    await hero().click();
    await expect.poll(() => heading().textContent()).toBe('С сервера');
    await expect.poll(() => heading().getAttribute('contenteditable')).toBe('true');
    expect(await countOf('edit-field')).toBe(0);
  });

  it('update-block, пока курсор в элементе, и правка — ждавший ответ отбрасывается', async () => {
    answerHeading = 'С сервера';
    await heading().click();
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    await updateHeading();
    await expect.poll(() => bodies.length).toBe(1);
    await hero().click();
    await expect.poll(() => lastOf('edit-field')).toMatchObject({ field: 'heading', value: 'О насx' });
    await page.waitForTimeout(300);
    expect(await heading().textContent()).toBe('О насx');
  });

  it('фокус перешёл в другой элемент той же секции — ответ ждёт дальше', async () => {
    answerHeading = 'С сервера';
    await heading().click();
    await updateHeading();
    await expect.poll(() => bodies.length).toBe(1);
    await frame().locator('[data-merfy-edit-html="text"]').click();
    await page.waitForTimeout(300);
    expect(await heading().textContent()).toBe('О нас');
    expect(await focused('[data-merfy-edit-html="text"]')).toBe(true);
  });

  it('после замены секции новый элемент снова редактируемый', async () => {
    answerHeading = 'С сервера';
    await updateHeading();
    await expect.poll(() => heading().textContent()).toBe('С сервера');
    await expect.poll(() => heading().getAttribute('contenteditable')).toBe('true');
  });

  it('пустой элемент показывает подсказку из data-merfy-placeholder', async () => {
    await heading().evaluate((node) => {
      node.textContent = '';
    });
    await expect
      .poll(() => heading().evaluate((node) => getComputedStyle(node, '::before').content))
      .toBe('"Заголовок"');
  });
});
