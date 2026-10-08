import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import probeLocals from '../fixtures/probe-locals.json';
import type { ShopPageLocals } from '../src/locals';
import { startRenderer, type Renderer } from '../src/renderer';

// Быстрые тесты рисовальщика — на подставной серверной сборке: тот же handler, что у @astrojs/node, без Astro.
const FAKE_ENTRY = fileURLToPath(new URL('../fixtures/fake-server-entry.mjs', import.meta.url));
const NO_HANDLER_ENTRY = fileURLToPath(new URL('../fixtures/no-handler-entry.mjs', import.meta.url));

const localsOf = (name: string): ShopPageLocals => ({ ...probeLocals, shop: { name } });

describe('рисовальщик на подставной сборке', () => {
  let renderer: Renderer;

  beforeAll(async () => {
    renderer = await startRenderer(FAKE_ENTRY);
  });

  afterAll(async () => {
    await renderer.close();
  });

  it('рисует страницу: данные — из locals, не из адреса', async () => {
    await expect(renderer.render('/', localsOf('Лён и шерсть'))).resolves.toBe('<h1>Лён и шерсть</h1><p>© 2026</p>');
  });

  it('запросы разом получают каждый свои данные', async () => {
    const names = ['Первый', 'Второй', 'Третий', 'Четвёртый'];
    const pages = await Promise.all(names.map((name) => renderer.render('/', localsOf(name))));
    expect(pages).toEqual(names.map((name) => `<h1>${name}</h1><p>© 2026</p>`));
  });

  it('такой страницы у темы нет — page-unknown', async () => {
    await expect(renderer.render('/nope', localsOf('Стенд'))).rejects.toMatchObject({
      code: 'page-unknown',
      message: '/nope: рисовальщик ответил 404',
    });
  });

  it('страница упала — render-failed с кодом ответа', async () => {
    await expect(renderer.render('/broken', localsOf('Стенд'))).rejects.toMatchObject({
      code: 'render-failed',
      message: '/broken: рисовальщик ответил 500',
    });
  });

  it.each(['nope', '//evil.example/'])('адрес «%s» не рисуется: путь начинается с одной косой черты', async (path) => {
    await expect(renderer.render(path, localsOf('Стенд'))).rejects.toMatchObject({
      code: 'page-unknown',
      message: `${path}: адрес страницы начинается с одной косой черты`,
    });
  });
});

describe('запуск рисовальщика', () => {
  it('в сборке нет handler — renderer-invalid', async () => {
    await expect(startRenderer(NO_HANDLER_ENTRY)).rejects.toMatchObject({ code: 'renderer-invalid' });
  });

  it('после close рисовальщик не отвечает', async () => {
    const renderer = await startRenderer(FAKE_ENTRY);
    await renderer.close();
    await expect(renderer.render('/', localsOf('Стенд'))).rejects.toThrow('fetch failed');
  });
});
