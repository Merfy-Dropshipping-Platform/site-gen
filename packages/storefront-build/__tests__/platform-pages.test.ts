import { describe, expect, it } from 'vitest';
import standInputsJson from '../fixtures/stand-inputs.json';
import { buildStorefront, type ThemeBuild } from '../src/build';
import { sha256 } from '../src/canonical';
import type { BuildFile } from '../src/client-files';
import type { BuildInputs } from '../src/inputs';
import { specialFiles } from '../src/platform-pages';
import { NOT_FOUND_ROUTE, pageInfoById, routeOf, shopRoutes } from '../src/routes';
import type { PageRender, SectionRenderRequest } from '../src/sections-render';
import { changedInputs, rawInputs, standInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

// Страницы 404 и 502 (блок 7 «Секций и SDK», часть 7а): 404 — темой, если у «Страницы 404» есть секции, иначе простая
// страница платформы в цветах магазина; 502 — в каждой сборке, только токены.
const REFERENCES = { platformCommit: '0123456789abcdef0123456789abcdef01234567' };
const THEME: ThemeBuild = { tokens: novaTokens, render: fakeRender, clientFiles: [] };
const MODULE = 'export default "секция";';
const HASH = sha256(Buffer.from(MODULE, 'utf8'));
const OWN = { id: 'page-custom-1', slug: '/o-nas', name: 'О нас', seo: { title: '', description: '', keywords: '' } };

const fileOf = (files: readonly BuildFile[], path: string): string =>
  Buffer.from(files.find((file) => file.path === path)?.content ?? new Uint8Array()).toString('utf8');

const section = (name: string) => ({ name, kind: 'section' as const, hash: sha256(name), render: HASH, script: null });

function withNotFoundSections(hidden?: true): BuildInputs {
  return changedInputs((inputs) => {
    inputs.code = {
      sections: [section('shop:error-404'), section('shop:header')],
      pages: {
        header: [{ id: 'header-1', section: 'shop:header', settings: {} }],
        'not-found': [{ id: 'error-1', section: 'shop:error-404', settings: {}, hidden }],
      },
      globals: [],
    };
  });
}

function pageOf(requests: SectionRenderRequest[]): PageRender {
  const render = (request: SectionRenderRequest): Promise<string> => {
    requests.push(request);
    return Promise.resolve(`<p>${request.section}</p>`);
  };
  return { sections: { modules: new Map([[HASH, MODULE]]), render }, mode: 'live' };
}

describe('адрес страницы 404', () => {
  it('у сборки есть /404, в своих страницах и карте сайта его нет', () => {
    expect(NOT_FOUND_ROUTE).toEqual({ id: 'not-found', path: '/404', file: '404.html', entity: 'site' });
    expect(routeOf('/404', standInputs)).toEqual(NOT_FOUND_ROUTE);
    expect(shopRoutes(standInputs).map((route) => route.path)).toEqual(['/']);
  });

  it('страница по id: своя, 404, неизвестный id — главная', () => {
    const inputs = changedInputs((raw) => (raw.revision.pages = [OWN]));
    expect(pageInfoById(inputs, 'page-custom-1')).toEqual({ id: 'page-custom-1', path: '/o-nas' });
    expect(pageInfoById(inputs, 'not-found')).toEqual({ id: 'not-found', path: null });
    expect(pageInfoById(inputs, 'page-unknown')).toEqual({ id: 'home', path: '/' });
  });
});

describe('404.html и 502.html в сборке', () => {
  it('файлы в сборке и манифесте; строк страниц у них нет', async () => {
    const { manifest, files } = await buildStorefront(standInputsJson, REFERENCES, THEME);
    expect(files.map((file) => file.path)).toEqual(['404.html', '502.html', 'index.html']);
    expect(Object.keys(manifest.files)).toEqual(expect.arrayContaining(['404.html', '502.html']));
    expect(manifest.pages.map((page) => page.path)).toEqual(['/']);
  });

  it('у «Страницы 404» нет секций — простая 404 платформы в цветах магазина', async () => {
    const html = fileOf((await buildStorefront(standInputsJson, REFERENCES, THEME)).files, '404.html');
    expect(html).toContain('<html lang="ru">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<title>Страница не найдена · Стенд Nova</title>');
    expect(html).toContain('<style id="merfy-fonts">');
    expect(html).toContain('<style id="merfy-tokens">');
    expect(html).toContain('--primary');
    expect(html).toContain('<main><h1>Страница не найдена</h1><a href="/">На главную</a></main>');
    expect(html).not.toContain('<script');
  });

  it('502 — только токены магазина: без шрифтов, ссылок и скриптов', async () => {
    const html = fileOf((await buildStorefront(standInputsJson, REFERENCES, THEME)).files, '502.html');
    expect(html).toContain('<title>Сайт временно недоступен · Стенд Nova</title>');
    expect(html).toContain('<style id="merfy-tokens">');
    expect(html).toContain('<main><h1>Сайт временно недоступен</h1><p>Попробуйте через минуту</p></main>');
    expect(html).not.toContain('merfy-fonts');
    expect(html).not.toMatch(/<script|<link|href=/);
  });

  it('имя магазина в заголовке экранировано', async () => {
    const raw = rawInputs((inputs) => (inputs.site.name = 'Шарфы & "Лён"'));
    const html = fileOf((await buildStorefront(raw, REFERENCES, THEME)).files, '502.html');
    expect(html).toContain('<title>Сайт временно недоступен · Шарфы &amp; &quot;Лён&quot;</title>');
  });

  it('у «Страницы 404» есть секции — страница темы: шапка и секции, page — not-found без адреса', async () => {
    const requests: SectionRenderRequest[] = [];
    const special = await specialFiles(withNotFoundSections(), THEME, pageOf(requests));
    const html = fileOf(special.files, '404.html');
    expect(special.files.map((file) => file.path)).toEqual(['404.html', '502.html']);
    expect(special.rendered).toHaveLength(1);
    // Рисовальщику — адрес главной (Astro держит /404 за своей страницей ошибки), канонический адрес — /404.
    expect(html).toContain('<body data-path="/">');
    expect(html).toContain('<link rel="canonical" href="https://nova-stand.example/404">');
    expect(html).toContain('data-section="shop:error-404"');
    expect(html).toContain('<title>Страница не найдена · Стенд Nova</title>');
    const notFound = { id: 'not-found', path: null };
    expect(requests.map((request) => [request.section, request.page])).toEqual([
      ['shop:header', notFound],
      ['shop:error-404', notFound],
    ]);
  });

  it('секция «Страницы 404» скрыта — простая 404, секции не рендерятся', async () => {
    const requests: SectionRenderRequest[] = [];
    const special = await specialFiles(withNotFoundSections(true), THEME, pageOf(requests));
    expect(fileOf(special.files, '404.html')).toContain('<main><h1>Страница не найдена</h1>');
    expect(special.rendered).toEqual([]);
    expect(requests).toEqual([]);
  });
});
