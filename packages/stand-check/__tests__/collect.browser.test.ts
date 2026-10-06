import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import rulesJson from '../compare-rules.json';
import { collectWithTokens, type Collected } from '../src/browser/collect';
import { openPage } from '../src/browser/session';
import { comparePassports, verdictOf } from '../src/compare/compare';
import { parseRules } from '../src/compare/rules';
import { packagePath } from '../src/paths';
import type { SabotageName } from '../src/run/sabotage';
import { serveFolder, type StaticServer } from './support/static-server';

// Тестовая страница из fixtures/ — без темы (design.md, задача 6): всё, что паспорт должен увидеть.
const TEST_ROUTES = {
  apiPrefix: '/api/',
  routes: [{ method: 'GET', path: '/api/stand/ping', file: 'fixtures/test-page/ping.json' }],
};
const TOKEN_NAMES = ['--background', '--radius-button', '--missing'];

let server: StaticServer;
let clean: Collected;

const collectTestPage = (page: string, sabotage: SabotageName[]): Promise<Collected> =>
  openPage(`${server.url}${page}`, { routes: TEST_ROUTES, sabotage }, (opened) =>
    collectWithTokens(opened, 'local', TOKEN_NAMES),
  );

beforeAll(async () => {
  server = await serveFolder(packagePath('fixtures/test-page'));
  clean = await collectTestPage('/index.html', []);
});

afterAll(async () => {
  await server.close();
});

describe('паспорт тестовой страницы в браузере', () => {
  it('страница и место прогона', () => {
    expect(clean.passport.page).toBe('/index.html');
    expect(clean.passport.target).toBe('local');
  });

  it('скрипты: JSON-конфиг по id и модуль с хэшем в имени, без ?v=', () => {
    expect(clean.passport.scripts).toHaveLength(2);
    expect(clean.passport.scripts[0]).toEqual({ src: '#merfy-config', kind: 'json', bytes: 19 });
    expect(clean.passport.scripts[1]).toMatchObject({ src: '/app.*.js', kind: 'module', hash: '3f9a2c1e' });
    expect(clean.passport.scripts[1].bytes).toBeGreaterThan(0);
  });

  it('глобал __MERFY_SAMPLE__ — JSON с ключами по алфавиту', () => {
    expect(clean.passport.globals).toEqual({ __MERFY_SAMPLE__: '{"a":1,"b":2}' });
  });

  it('хранилище и cookie — только ключи и имена', () => {
    expect(clean.passport.storage).toEqual(['local:merfy:cartId', 'session:stand:visit']);
    expect(clean.passport.cookies).toEqual(['merfy_consent']);
  });

  it('запросы: страница, скрипт без хэша и ?v=, подмена — 200, неизвестный запрос к API — 501', () => {
    expect(clean.passport.requests).toEqual([
      { url: '/api/stand/ping', status: 200 },
      { url: '/api/stand/unknown', status: 501 },
      { url: '/app.*.js', status: 200 },
      { url: '/index.html', status: 200 },
    ]);
  });

  it('ошибки: console.error страницы и ответ 501', () => {
    expect(clean.passport.errors).toEqual([
      'Failed to load resource: the server responded with a status of 501 (Not Implemented)',
      'стенд: тестовая ошибка',
    ]);
  });

  it('токены: только заданные на :root, по именам', () => {
    expect(clean.passport.tokens).toEqual({ '--background': '#ffffff', '--radius-button': '0.5rem' });
  });

  it('шрифтов на странице нет, разделы data-stand — по порядку', () => {
    expect(clean.passport.fonts).toEqual([]);
    expect(clean.sections).toEqual(['schemes', 'price']);
  });
});

describe('поломки через page.addInitScript', () => {
  it('лишний скрипт, глобал и другой ключ корзины видны в паспорте — красный', async () => {
    const sabotaged = await collectTestPage('/index.html', ['script', 'global', 'cart']);
    expect(sabotaged.passport.scripts.map((script) => script.src)).toContain('inline:1');
    expect(sabotaged.passport.globals).toHaveProperty('__MERFY_SITE_ID__', '"demo-site"');
    expect(sabotaged.passport.storage).toContain('local:cart:v2');
    const differences = comparePassports(clean.passport, sabotaged.passport, parseRules(rulesJson));
    expect(verdictOf(differences)).toBe('red');
  });

  it('два прогона подряд без поломок — чисто', async () => {
    const again = await collectTestPage('/index.html', []);
    expect(verdictOf(comparePassports(clean.passport, again.passport, parseRules(rulesJson)))).toBe('clean');
  });

  it('страница ответила не 200 — ошибка page-unavailable', async () => {
    await expect(collectTestPage('/missing.html', [])).rejects.toThrow(
      /^page-unavailable: .*missing\.html ответил 404/,
    );
  });
});
