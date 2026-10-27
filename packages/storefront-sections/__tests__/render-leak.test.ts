import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SAMPLE_RECORDS, SAMPLE_THEME, money, sampleRecord, sampleRecordValues } from '@merfy/storefront-build';
import { describe, expect, it } from 'vitest';
import { sharedSettingsFileShape } from '../src/names';
import { PROBLEM_INFO } from '../src/problem-info';
import { isWarning, type SectionProblem } from '../src/problems';
import { leakHint, renderLeaks } from '../src/render-leak';
import { readSectionFolder } from '../src/read-folder';
import { prepareInWorker } from '../src/sandbox';

// Пробный рендер на примерах данных и поиск утечек в его HTML (блок 2 «Секций и SDK», «Утечки в HTML»): секция с
// {…price} вместо {…price.text} раньше проходила проверку и выводила «[object Object] ₽» на витрине.
const SHOP = fileURLToPath(new URL('../fixtures/shop', import.meta.url));
const SHELL = fileURLToPath(new URL('../../storefront-shell/sections', import.meta.url));

const manifestOf = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    sdk: 1,
    name: 'leak-probe',
    kind: 'section',
    title: 'Проба',
    settings: [{ id: 'product', label: 'Выбор товара', setting: { kind: 'product' } }],
    ...extra,
  });

async function problemsOf(body: string, extra: Record<string, unknown> = {}): Promise<SectionProblem[]> {
  // shop в Astro.props можно читать только с "uses": ["shop"] (Р1-4-5).
  const props = Array.isArray(extra.uses) && extra.uses.includes('shop') ? 'settings, shop, page' : 'settings, page';
  const template = `---\nconst { ${props} } = Astro.props;\n---\n${body}`;
  const result = await prepareInWorker({
    prefix: 'shop',
    files: { 'section.json': manifestOf(extra), 'template.astro': template },
  });
  return result.ok ? [] : result.problems;
}

describe('render-leak: объект вместо текста в HTML пробного рендера', () => {
  it('{settings.product.price} — отказ с подсказкой про Money и price.text', async () => {
    const problems = await problemsOf('{settings.product && <p class="m-0">{settings.product.price} ₽</p>}');
    expect(problems.map((item) => [item.code, item.file, isWarning(item)])).toEqual([
      ['render-leak', 'template.astro', false],
    ]);
    const message = problems[0]?.message ?? '';
    expect(message).toContain('на примерах данных магазина');
    expect(message).toContain('в тексте найдено «[object Object]»');
    expect(message).toContain('[object Object] ₽');
    expect(message).toContain('price.text');
  });

  it('{settings.product.price.text} и compareAtPrice с проверкой на null — без проблем', async () => {
    const body =
      '{settings.product && <p class="m-0">{settings.product.price.text}{settings.product.compareAtPrice && <s>{settings.product.compareAtPrice.text}</s>}</p>}';
    expect(await problemsOf(body)).toEqual([]);
  });

  it('объект в атрибуте alt — отказ с названием атрибута', async () => {
    const problems = await problemsOf(
      '{settings.product && <img src="https://s3.merfy.ru/p/1.jpg" alt={settings.product.price} />}',
    );
    expect(problems.map((item) => item.code)).toEqual(['render-leak']);
    expect(problems[0]?.message).toContain('в атрибуте alt найдено «[object Object]»');
  });

  it('uses: shop — объект магазина в тексте даёт отказ', async () => {
    const problems = await problemsOf('<p>{shop.contacts}</p>', { uses: ['shop'], settings: [] });
    expect(problems.map((item) => item.code)).toEqual(['render-leak']);
    expect(problems[0]?.message).toContain('[object Object]');
  });

  it('uses: shop — поля магазина текстом проходят: у примера есть телефон, почта и онлайн-оплата', async () => {
    const body =
      '<p>{shop.name}: {shop.contacts.phone} {shop.contacts.email} {shop.payments.online ? "онлайн" : ""}</p>';
    expect(await problemsOf(body, { uses: ['shop'], settings: [] })).toEqual([]);
  });

  it('страница товара: объект из page.record.price — отказ со страницей product', async () => {
    const problems = await problemsOf('{page.record && page.record.price && <p>{page.record.price}</p>}', {
      settings: [],
    });
    expect(problems.map((item) => item.code)).toEqual(['render-leak']);
    expect(problems[0]?.message).toContain('страница product');
    expect(problems[0]?.message).toContain('в тексте найдено «[object Object]»');
  });

  it('страница товара: price.text — без проблем', async () => {
    expect(
      await problemsOf('{page.record && page.record.price && <p>{page.record.price.text}</p>}', { settings: [] }),
    ).toEqual([]);
  });

  it('шаблон для страницы статьи, который на странице товара падает, — не отказ', async () => {
    const body = '{page.record && <p>{page.record.blog.url} {page.record.publishedAt.slice(0, 10)}</p>}';
    expect(await problemsOf(body, { settings: [] })).toEqual([]);
  });

  it('undefined в тексте от шаблонной строки — отказ с подсказкой про значения, которых нет', async () => {
    const problems = await problemsOf('{settings.product && <p>{`${settings.product.sku} шт`}</p>}');
    expect(problems.map((item) => item.code)).toEqual(['render-leak']);
    expect(problems[0]?.message).toContain('найдено «undefined»');
  });

  it('шаблон падает на примерах данных — render-failed с текстом ошибки', async () => {
    const problems = await problemsOf('{settings.product && <p>{settings.product.variants[5].title}</p>}');
    expect(problems.map((item) => item.code)).toEqual(['render-failed']);
    expect(problems[0]?.message).toMatch(/^шаблон не отрисовался на примерах данных магазина: /);
  });

  it('на умолчаниях и пустых значениях утечка тоже находится: NaN из пустой строки', async () => {
    const problems = await problemsOf('<p>{Number(settings.heading) + 1}</p>', {
      settings: [{ id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: 'пять' } }],
    });
    expect(problems.map((item) => item.code)).toEqual(['render-leak']);
    expect(problems[0]?.message).toContain('с умолчаниями настроек');
    expect(problems[0]?.message).toContain('NaN');
  });

  it('у кода есть справка для документации SDK', () => {
    expect(PROBLEM_INFO['render-leak'].fix).toContain('price.text');
  });
});

describe('renderLeaks: что считается утечкой', () => {
  it('видимый текст и атрибуты alt, title, aria-label, placeholder, value, href, src, content', () => {
    const html = [
      '<p>цена [object Object] ₽</p>',
      '<img alt="[object Object]" src="/a.png">',
      '<a title="NaN" aria-label=\'undefined\' href=/x>ссылка</a>',
      '<input placeholder="undefined" value="NaN">',
      '<meta content="[object Object]">',
    ].join('');
    const places = renderLeaks(html).map((leak) => `${leak.place}: ${leak.found}`);
    expect(places).toEqual([
      'в атрибуте alt: [object Object]',
      'в атрибуте title: NaN',
      'в атрибуте aria-label: undefined',
      'в атрибуте placeholder: undefined',
      'в атрибуте value: NaN',
      'в атрибуте content: [object Object]',
      'в тексте: [object Object]',
    ]);
  });

  it('script, style, комментарии, data-атрибуты и слова внутри других слов не считаются', () => {
    const html = [
      '<script type="application/json">{"price":"[object Object]","a":undefined}</script>',
      '<style>.undefined{}</style>',
      '<!-- NaN [object Object] -->',
      '<div data-photos="undefined" class="NaN">undefined-page, NaNa, notundefined</div>',
      '<a href="/catalog#undefined-x">к каталогу</a>',
    ].join('');
    expect(renderLeaks(html)).toEqual([]);
  });

  it('значения с сущностями раскрываются; одна находка в одном месте — один раз', () => {
    const html = '<p>&#91;object Object&#93; и [object Object]</p><p>NaN</p><p>NaN</p>';
    expect(renderLeaks(html).map((leak) => leak.found)).toEqual(['[object Object]', 'NaN']);
  });

  it('onlyObjects: undefined и NaN пропускаются, объект — нет', () => {
    expect(renderLeaks('<p>undefined NaN</p>', true)).toEqual([]);
    expect(renderLeaks('<p>[object Object]</p>', true).map((leak) => leak.found)).toEqual(['[object Object]']);
  });

  it('подсказка про цену — рядом со знаком валюты; без него — общая', () => {
    const hintOf = (html: string): string => leakHint(renderLeaks(html).at(0) ?? { place: '', found: '', near: '' });
    expect(hintOf('<p>[object Object] ₽</p>')).toContain('price.text');
    expect(hintOf('<p>Заголовок [object Object]</p>')).not.toContain('price.text');
  });
});

describe('примеры данных магазина', () => {
  it('товар: цена не 0, старая цена, варианты, картинки; есть распроданный и без старой цены', () => {
    const product = sampleRecord('product');
    expect(product.price.amount).toBeGreaterThan(0);
    expect(product.compareAtPrice?.amount).toBeGreaterThan(product.price.amount);
    expect(product.variants.length).toBeGreaterThan(1);
    expect(product.options.length).toBeGreaterThan(0);
    expect(product.images.length).toBeGreaterThan(1);
    const products = SAMPLE_RECORDS.products.map((entry) => entry.record);
    expect(products.some((item) => !item.available)).toBe(true);
    expect(products.some((item) => item.compareAtPrice === null)).toBe(true);
  });

  it('поля с записями: каждому виду — запись своего вида; пусто — нет записей', () => {
    const values = sampleRecordValues({ item: 'product', set: 'collection', posts: 'blog', law: 'policy' });
    expect(Object.keys(values)).toEqual(['item', 'set', 'posts', 'law']);
    expect(values.item).toMatchObject({ id: 'p-2', price: money(350000) });
    expect(values.set).toMatchObject({ id: 'c-1', productsCount: 2 });
    expect(values.posts).toMatchObject({ id: 'b-1', articlesCount: 1 });
    expect(values.law).toMatchObject({ type: 'privacy' });
    expect(sampleRecordValues(undefined)).toEqual({});
  });

  it('для каждой сквозной настройки темы есть пример значения', () => {
    const text = readFileSync(new URL('../generated/shared-settings.json', import.meta.url), 'utf8');
    const shared = sharedSettingsFileShape.parse(JSON.parse(text));
    expect(shared.filter(({ id }) => !(id in SAMPLE_THEME)).map(({ id }) => id)).toEqual([]);
  });
});

describe('наши секции проходят поиск утечек', () => {
  const folders = [
    ...readdirSync(SHOP).map((name) => `${SHOP}/${name}`),
    ...readdirSync(SHELL).map((name) => `${SHELL}/${name}`),
  ].sort();

  it.each(folders.map((folder) => [folder.split('/').at(-1) ?? folder, folder]))(
    '%s — без отказов',
    async (_name, folder) => {
      const result = await prepareInWorker({ prefix: 'shop', files: await readSectionFolder(folder) });
      expect(result.ok ? [] : result.problems.map((item) => `${item.code}: ${item.message}`)).toEqual([]);
    },
    30_000,
  );
});
