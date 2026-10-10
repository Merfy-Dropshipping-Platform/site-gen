import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../src/preview-agent';

// Слушатель превью (design.md блока 8): запускаем строку скрипта с подставными window, document и fetch — как её
// исполнит iframe стенда.
type Listener = (event: { source: unknown; data: unknown }) => void;
type Answer = { ok: boolean; status: number; body: unknown };

function harness(answers: Answer[]) {
  const messages: unknown[] = [];
  const parent = { messages, postMessage: (message: unknown) => messages.push(message) };
  const listeners: Listener[] = [];
  const style = { textContent: 'старый CSS' };
  const attributes: Record<string, string> = {};
  const requests: { url: string; body: string }[] = [];
  const pending: Array<() => void> = [];
  const window = { parent, addEventListener: (_: string, listener: Listener) => listeners.push(listener) };
  const document = {
    getElementById: (id: string) => (id === 'merfy-tokens' ? style : null),
    documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) },
  };
  const reloads: string[] = [];
  const location = {
    href: 'https://gateway.dev.merfy.ru/api/sites/abc/preview?page=%2F&_t=1',
    reload: () => reloads.push('reload'),
  };
  const fetch = (url: string, init: { body: string }) => {
    requests.push({ url, body: init.body });
    const answer = answers.shift() ?? { ok: false, status: 500, body: {} };
    return new Promise((resolve) => pending.push(() => resolve({ ...answer, json: () => answer.body })));
  };
  const quiet = { error: () => undefined };
  runInNewContext(PREVIEW_AGENT, { window, document, location, fetch, console: quiet, URL, JSON });
  const send = (data: unknown, source: unknown = parent) => listeners.forEach((listener) => listener({ source, data }));
  const settle = async (index: number) => {
    pending[index]();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { parent, style, attributes, requests, reloads, send, settle };
}

const CSS = { css: ':root{--primary:#16a34a}', attributes: { 'data-card-style': 'card' } };

describe('слушатель превью', () => {
  it('update-tokens → POST …/preview/tokens, CSS и атрибуты подменены, родителю — tokens-applied', async () => {
    const page = harness([{ ok: true, status: 200, body: CSS }]);
    page.send({ type: 'update-tokens', tokens: { root: { 'choice-card-style': 'card' } } });
    expect(page.requests).toEqual([
      {
        url: 'https://gateway.dev.merfy.ru/api/sites/abc/preview/tokens',
        body: '{"tokens":{"root":{"choice-card-style":"card"}}}',
      },
    ]);
    await page.settle(0);
    expect(page.style.textContent).toBe(CSS.css);
    expect(page.attributes).toEqual({ 'data-card-style': 'card' });
    expect(page.parent.messages).toEqual([{ type: 'tokens-applied' }]);
  });

  it('побеждает последняя правка: ответ на старую не применяется', async () => {
    const page = harness([
      { ok: true, status: 200, body: { css: 'первый', attributes: {} } },
      { ok: true, status: 200, body: { css: 'второй', attributes: {} } },
    ]);
    page.send({ type: 'update-tokens', tokens: {} });
    page.send({ type: 'update-tokens', tokens: {} });
    await page.settle(1);
    await page.settle(0);
    expect(page.style.textContent).toBe('второй');
  });

  it('не от родителя, не тот тип, без объекта tokens (themeSettings нынешнего автосейва) — не трогает стенд', () => {
    const page = harness([]);
    page.send({ type: 'update-tokens', tokens: {} }, {});
    page.send({ type: 'reconcile', tokens: {} });
    page.send({ type: 'update-tokens', themeSettings: { buttonRadius: 8 } });
    expect(page.requests).toEqual([]);
  });

  it('reload-preview от родителя — тихая перезагрузка стенда; от чужого окна — нет', () => {
    const page = harness([]);
    page.send({ type: 'reload-preview' }, {});
    expect(page.reloads).toEqual([]);
    page.send({ type: 'reload-preview' });
    expect(page.reloads).toEqual(['reload']);
  });

  it('ручка ответила ошибкой — CSS прежний, родителю — tokens-failed', async () => {
    const page = harness([{ ok: false, status: 400, body: { problems: ['…'] } }]);
    page.send({ type: 'update-tokens', tokens: { root: { 'choice-card-style': 'grid' } } });
    await page.settle(0);
    expect(page.style.textContent).toBe('старый CSS');
    expect(page.parent.messages).toEqual([{ type: 'tokens-failed' }]);
  });
});
