import { RECORD_FIELDS, SAMPLE_SHOP, sampleRecord, sampleRecordValues, sha256 } from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { FIELD_PROBLEMS_MAX, fieldUnknownText } from '../src/field-unknown';
import { readManifest } from '../src/format';
import { PROBLEM_INFO } from '../src/problem-info';
import { isWarning, type SectionProblem } from '../src/problems';
import { FIELD_READS_MAX, RECORD_SHAPES, recordWatchOf, watchProps } from '../src/record-shapes';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { prepareInWorker } from '../src/sandbox';

// Чтение поля, которого у записи нет (28.11): в прогоне 28.11 секция «Со скидкой» сравнивала price.value — у цены поля
// value нет, значок скидки не появлялся никогда, а проверка при сохранении молчала. Воспроизведения дефектов здесь свои,
// минимальные: секции прогона в тесты не входят.

const PRODUCT_FIELD = { id: 'product', label: 'Выбор товара', setting: { kind: 'product' } };
const COLLECTION_FIELD = { id: 'collection', label: 'Выбор коллекции', setting: { kind: 'collection' } };

const manifestOf = (extra: Record<string, unknown>): string =>
  JSON.stringify({ sdk: 1, name: 'field-probe', kind: 'section', title: 'Проба', settings: [PRODUCT_FIELD], ...extra });

async function problemsOf(
  body: string,
  extra: Record<string, unknown> = {},
  props = 'settings, page',
): Promise<string[]> {
  const template = `---\nconst { ${props} } = Astro.props;\n---\n${body}`;
  const result = await prepareInWorker({
    prefix: 'shop',
    files: { 'section.json': manifestOf(extra), 'template.astro': template },
  });
  return result.ok ? [] : result.problems.map((item: SectionProblem) => `${item.code}: ${item.message}`);
}

const unknownOf = (problems: readonly string[]): string[] =>
  problems.filter((text) => text.startsWith('render-field-unknown'));

describe('render-field-unknown: шаблон читает поле, которого у записи нет', () => {
  it('«Со скидкой»: price.value у карточки коллекции — отказ с полями цены и советом', async () => {
    const body = [
      '{settings.collection && <ul class="m-0">{settings.collection.products.map((card) => (',
      '<li>{card.compareAtPrice && card.compareAtPrice.value > card.price.value && <s>{card.compareAtPrice.text}</s>}',
      '{card.price.text}</li>))}</ul>}',
    ].join('');
    const problems = await problemsOf(body, { settings: [COLLECTION_FIELD] });
    expect(problems.map((text) => text.split(':')[0])).toEqual(['render-field-unknown', 'render-field-unknown']);
    expect(problems[0]).toBe(
      'render-field-unknown: шаблон читает `settings.collection.products[].compareAtPrice.value`: у цены нет поля ' +
        '`value`. Есть: `amount` (копейки), `currency`, `text` (готовая строка). Сравнивай по `amount`, выводи `text`.',
    );
    expect(problems[1]).toContain('`settings.collection.products[].price.value`');
  });

  it('та же секция с amount — без проблем', async () => {
    const body = [
      '{settings.collection && <ul class="m-0">{settings.collection.products.map((card) => (',
      '<li>{card.compareAtPrice && card.compareAtPrice.amount > card.price.amount && <s>{card.compareAtPrice.text}</s>}',
      '{card.price.text}</li>))}</ul>}',
    ].join('');
    expect(await problemsOf(body, { settings: [COLLECTION_FIELD] })).toEqual([]);
  });

  it('поле товара: settings.product.price.value — отказ, это не предупреждение', async () => {
    const result = await prepareInWorker({
      prefix: 'shop',
      files: {
        'section.json': manifestOf({}),
        'template.astro':
          '---\nconst { settings } = Astro.props;\n---\n{settings.product && settings.product.price.value > 0 && <p class="m-0">есть</p>}',
      },
    });
    const problems = result.ok ? [] : result.problems;
    expect(problems.map((item) => [item.code, item.file, isWarning(item)])).toEqual([
      ['render-field-unknown', 'template.astro', false],
    ]);
    expect(problems[0]?.message).toContain('`settings.product.price.value`: у цены нет поля `value`');
  });

  it('«Смартфоны»: variants у карточки коллекции — отказ с ближайшим именем variantId', async () => {
    const body = [
      '{settings.collection && settings.collection.products.map((card) => (',
      '<button type="button" data-action="cart.add" data-product-id={card.id}',
      ' data-variant={card.variants && card.variants[0] ? card.variants[0].id : ""}>В корзину</button>))}',
    ].join('');
    const problems = unknownOf(await problemsOf(body, { settings: [COLLECTION_FIELD] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('`settings.collection.products[].variants`: у карточки товара нет поля `variants`');
    expect(problems[0]).toContain('`variantId` (вариант для «В корзину» или null)');
    expect(problems[0]).toContain('Ближе всего — `variantId`.');
  });

  it('поле с записью в блоке: block.settings.<id> под наблюдением', async () => {
    const extra = {
      settings: [],
      blocks: { item: { title: 'Товар', limit: 3, settings: [PRODUCT_FIELD] } },
      defaultBlocks: [{ type: 'item', settings: {} }],
    };
    const body =
      '<div class="m-0">{blocks.map((block) => <p class="m-0">{block.settings.product && block.settings.product.sku}</p>)}</div>';
    const problems = await problemsOf(body, extra, 'settings, blocks');
    expect(unknownOf(problems)).toEqual([
      expect.stringContaining('`block.settings.product.sku`: у товара нет поля `sku`'),
    ]);
  });

  it('данные магазина: shop.phone — отказ; shop.contacts.phone — нет', async () => {
    const extra = { uses: ['shop'], settings: [] };
    const wrong = await problemsOf('<p class="m-0">{shop.phone}</p>', extra, 'shop');
    expect(unknownOf(wrong)).toEqual([expect.stringContaining('`shop.phone`: у магазина нет поля `phone`')]);
    expect(await problemsOf('<p class="m-0">{shop.contacts.phone}</p>', extra, 'shop')).toEqual([]);
  });

  it('ближайшее имя: image у товара — images', async () => {
    const problems = await problemsOf('{settings.product && <img class="m-0" src={settings.product.image} alt="" />}');
    expect(unknownOf(problems)[0]).toContain('Ближе всего — `images`. Первое фото — `images[0]`');
  });

  it('не больше трёх отказов на сохранение', async () => {
    const reads = ['a1', 'a2', 'a3', 'a4', 'a5'].map((key) => `{settings.product && settings.product.${key}}`);
    const problems = await problemsOf(`<p class="m-0">${reads.join('')}</p>`);
    expect(unknownOf(problems)).toHaveLength(FIELD_PROBLEMS_MAX);
  });

  it('не отказ: необязательное поле null, служебное JS, методы массивов и строк, JSON и ключи записи', async () => {
    const body = [
      '{settings.product && <div class="m-0" data-json={JSON.stringify(settings.product)}',
      ' data-keys={Object.keys(settings.product).length} data-own={String(Object.hasOwn(settings.product, "sku"))}',
      ' data-in={String("sku" in settings.product)} data-type={typeof settings.product.then}>',
      '{settings.product.variants.filter((variant) => variant.compareAtPrice !== null).map((variant) => variant.title).join(", ")}',
      '{settings.product.options.flatMap((option) => option.values.map((value) => value.value)).at(0)}',
      '{settings.product.images.length}{settings.product.title.toUpperCase()}',
      '{settings.product.collections.find((link) => link.url)?.title}{typeof settings.product.price.valueOf}',
      '</div>}',
    ].join('');
    expect(await problemsOf(body)).toEqual([]);
  });

  it('данные страницы не наблюдаются: шаблон страницы товара на странице статьи', async () => {
    expect(
      await problemsOf('{page.record && <p class="m-0">{page.record.price && page.record.price.amount}</p>}', {
        settings: [],
      }),
    ).toEqual([]);
  });

  it('у кода есть справка для документации SDK', () => {
    expect(PROBLEM_INFO['render-field-unknown'].fix).toContain('amount');
  });
});

describe('watchProps: что считается чтением поля, которого нет', () => {
  const records = sampleRecordValues({ item: 'product', set: 'collection' });
  const watch = recordWatchOf({ item: 'product', set: 'collection' }, undefined, []);
  const watchedOf = () => watchProps({ records, shop: SAMPLE_SHOP }, watch);
  // Чтение свойства, как его делает шаблон: obj[key].
  const read = (value: unknown, key: PropertyKey): unknown => Reflect.get(Object(value), key);

  it('виды записей — ровно публичные поля RECORD_FIELDS', () => {
    for (const kind of ['product', 'collection', 'blog', 'policy'] as const)
      expect(Object.keys(RECORD_SHAPES[kind]).sort()).toEqual([...RECORD_FIELDS[kind]].sort());
  });

  it('чужой ключ — в журнал с путём и видом; поля вида, символы и служебные ключи — нет', () => {
    const { values, reads } = watchedOf();
    const item = values.records.item;
    const service = ['then', 'toJSON', 'render', 'astro:jsx', '$$slot', 'constructor', 'length', 'map'];
    ['title', 'price', Symbol.iterator, ...service].forEach((key) => read(item, key));
    expect(reads).toEqual([]);
    ['sku', 'sku'].forEach((key) => read(item, key));
    read(read(item, 'price'), 'value');
    expect(reads).toEqual([
      { path: 'settings.item', shape: 'product', key: 'sku' },
      { path: 'settings.item.price', shape: 'money', key: 'value' },
    ]);
  });

  it('значения те же: JSON, ключи, один и тот же вложенный объект при каждом чтении', () => {
    const { values } = watchedOf();
    expect(JSON.stringify(values.records)).toBe(JSON.stringify(records));
    const item = values.records.item;
    expect(Object.keys(item ?? {})).toEqual(Object.keys(sampleRecord('product')));
    expect(read(item, 'price')).toBe(read(item, 'price'));
    expect(read(item, 'variants')).toBe(read(item, 'variants'));
  });

  it('журнал не растёт больше FIELD_READS_MAX', () => {
    const { values, reads } = watchedOf();
    for (let index = 0; index < FIELD_READS_MAX + 5; index += 1) read(values.records.item, `field${index}`);
    expect(reads).toHaveLength(FIELD_READS_MAX);
  });

  it('поле без записи (null) и поле без вида — как есть', () => {
    const { values } = watchProps({ records: { empty: null, other: { a: 1 } }, shop: SAMPLE_SHOP }, watch);
    expect(values.records).toEqual({ empty: null, other: { a: 1 } });
  });

  it('текст без пометок и совета у вида без них', () => {
    expect(fieldUnknownText({ path: 'shop.payments', shape: 'shopPayments', key: 'card' })).toBe(
      'шаблон читает `shop.payments.card`: у оплаты магазина нет поля `card`. Есть: `online`.',
    );
  });
});

describe('процесс рендера: наблюдение только по ключу watch запроса', () => {
  const opened: SectionRenderer[] = [];
  afterEach(async () => {
    await Promise.all(opened.splice(0).map((renderer) => renderer.close()));
  });

  it('без watch — чтений нет, HTML тот же; с watch — чтение sku', async () => {
    const files = { 'section.json': manifestOf({}) };
    const manifest = readManifest(files);
    if (!manifest.ok) throw new Error(JSON.stringify(manifest.problems));
    const source =
      '---\nconst { settings } = Astro.props;\n---\n<p class="m-0">{settings.product.title}{settings.product.sku}</p>';
    const checked = await checkTemplate(source, templateOptionsOf(manifest.value));
    if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
    const renderer = startSectionRenderer();
    opened.push(renderer);
    const request = {
      section: 'shop:field-probe',
      hash: sha256(Buffer.from(checked.render, 'utf8')),
      module: checked.render,
      settings: {},
      records: sampleRecordValues({ product: 'product' }),
    };
    const plain = await renderer.trace(request);
    const watched = await renderer.trace({ ...request, watch: recordWatchOf({ product: 'product' }, undefined, []) });
    expect(plain.reads).toEqual([]);
    expect(watched.html).toBe(plain.html);
    expect(watched.reads).toEqual([{ path: 'settings.product', shape: 'product', key: 'sku' }]);
  });
});
