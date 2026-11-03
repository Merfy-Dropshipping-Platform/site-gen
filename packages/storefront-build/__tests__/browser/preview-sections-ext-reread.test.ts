import { chromium, type Browser, type Frame, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Замена секции при подставленных значениях сторов (ext-store-values; превью секции в кабинете расширения): прежняя секция
// убирается раньше, чем встаёт новая, — ядро успевает снять подписки прежней, и новая заново читает стор по записи.
// Без подмен прежняя секция заменяется в одном изменении документа, как у конструктора.
const ORIGIN = 'http://preview.test';
const FRAME = `${ORIGIN}/api/sites/s1/preview?page=home`;
const BLOCK = `${ORIGIN}/api/sites/s1/preview/block`;
const section = (text: string): string =>
  `<merfy-section data-section="test-ext:banner" data-section-id="preview-section"><p>${text}</p></merfy-section>`;
// Наблюдатель — первым в документе: каждый вызов — одно изменение, в нём число убранных и добавленных секций.
const OBSERVER = `<script>
window.batches = [];
new MutationObserver(function (records) {
  var removed = 0, added = 0;
  records.forEach(function (record) {
    record.removedNodes.forEach(function (node) { if (node.nodeName === 'MERFY-SECTION') removed += 1; });
    record.addedNodes.forEach(function (node) { if (node.nodeName === 'MERFY-SECTION') added += 1; });
  });
  if (removed + added > 0) window.batches.push({ removed: removed, added: added });
}).observe(document, { childList: true, subtree: true });
</script>`;
const CONFIG = { extensions: { 'test-ext': { stores: { card: { fn: 'itemCard', by: 'record', record: 'item' } }, methods: {} } } };
const FRAME_HTML = `<!doctype html><html><head>${OBSERVER}<script type="application/json" id="merfy-config">${JSON.stringify(CONFIG)}</script></head><body><main>${section('старая')}</main><script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><body><iframe id="preview" src="${FRAME}" style="width:800px;height:600px"></iframe><script>
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

declare global {
  interface Window {
    send: (message: unknown) => void;
  }
}

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: PARENT_HTML }),
  );
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: FRAME_HTML }));
  await page.route(BLOCK, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ html: section('новая'), css: '' }) }),
  );
  await page.goto(`${ORIGIN}/parent`);
  await page.evaluate(() => window.send({ type: 'init' }));
});

afterAll(async () => {
  await browser.close();
});

const frame = (): Frame => {
  const found = page.frames().find((candidate) => candidate.url().startsWith(FRAME.split('?')[0] ?? FRAME));
  if (found === undefined) throw new Error('нет iframe превью');
  return found;
};

const reconcile = (version: number, hash: string) =>
  page.evaluate(
    ([number, value]) =>
      window.send({
        type: 'reconcile',
        version: number,
        blocks: [{ id: 'preview-section', type: 'test-ext:banner', props: { settings: {}, group: 'page' }, propsHash: value }],
      }),
    [version, hash] as const,
  );

const batches = () => frame().evaluate(() => Reflect.get(window, 'batches') as { removed: number; added: number }[]);
const text = () => frame().evaluate(() => document.querySelector('merfy-section p')?.textContent ?? '');
const waitText = async (expected: string) => {
  for (let tries = 0; tries < 40 && (await text()) !== expected; tries += 1) await page.waitForTimeout(100);
};

describe('замена секции при значениях сторов', () => {
  it('без значений сторов секция заменяется одним изменением документа', async () => {
    await reconcile(1, 'h-1'); // уже стоящая секция принимает первую версию как свою
    await page.waitForTimeout(200);
    await frame().evaluate(() => Reflect.set(window, 'batches', []));
    await reconcile(2, 'h-2');
    await waitText('новая');
    expect(await batches()).toEqual([{ removed: 1, added: 1 }]);
  });

  it('со значениями сторов прежняя секция убирается раньше, чем встаёт новая', async () => {
    await frame().evaluate(() => {
      Reflect.set(window, 'batches', []);
      document.querySelector('merfy-section p')!.textContent = 'прежняя';
    });
    await page.evaluate(() =>
      window.send({
        type: 'ext-store-values',
        values: [{ extension: 'test-ext', store: 'card', recordId: 'r-1', value: { title: 'Из поля' } }],
      }),
    );
    await reconcile(3, 'h-3');
    await waitText('новая');
    expect(await batches()).toEqual([
      { removed: 1, added: 0 },
      { removed: 0, added: 1 },
    ]);
  });
});
