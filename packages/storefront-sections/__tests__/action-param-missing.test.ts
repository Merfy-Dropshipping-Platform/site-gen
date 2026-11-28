import { describe, expect, it } from 'vitest';
import { PROBLEM_INFO } from '../src/problem-info';
import { isWarning, type SectionProblem } from '../src/problems';
import { prepareInWorker } from '../src/sandbox';

// Кнопка действия без обязательного параметра (28.11): в прогоне 28.11 «Смартфоны» сохранились с кнопкой
// data-action="cart.add" без data-product-id — ядро витрины такой вызов отклоняет, кнопка молчала. Воспроизведения свои,
// минимальные: секции прогона в тесты не входят.

const COLLECTION_FIELD = { id: 'collection', label: 'Выбор коллекции', setting: { kind: 'collection' } };
const MANIFEST = JSON.stringify({
  sdk: 1,
  name: 'param-probe',
  kind: 'section',
  title: 'Проба',
  settings: [COLLECTION_FIELD],
});
const SCRIPT = "import { defineSection } from '@merfy/shell';\nexport default defineSection({ mount() {} });";

async function problemsOf(body: string, script = false): Promise<SectionProblem[]> {
  const template = `---\nconst { settings } = Astro.props;\n---\n${body}`;
  const files = {
    'section.json': MANIFEST,
    'template.astro': template,
    ...(script ? { 'script.ts': SCRIPT } : {}),
  };
  const result = await prepareInWorker({ prefix: 'shop', files });
  return result.ok ? [] : result.problems;
}

const missing = (problems: readonly SectionProblem[]): string[] =>
  problems.filter((item) => item.code === 'action-param-missing').map((item) => item.message);

const cards = (button: string): string =>
  `{settings.collection && settings.collection.products.map((card) => (<div class="m-0">${button}</div>))}`;

describe('action-param-missing: кнопка действия без обязательного параметра', () => {
  it('«Смартфоны»: cart.add без data-product-id — отказ с местом, источником значения и ссылкой', async () => {
    const problems = await problemsOf(
      cards('<button type="button" data-action="cart.add" data-variant-id={card.variantId}>В корзину</button>'),
    );
    const found = problems.filter((item) => item.code === 'action-param-missing');
    expect(found.map((item) => [item.file, item.line, isWarning(item)])).toEqual([['template.astro', 4, false]]);
    expect(found[0]?.message).toBe(
      'кнопка `cart.add` без `data-product-id`: витрина не узнает, какой товар. Добавь `data-product-id={<запись>.id}`: ' +
        'у товара — `settings.product.id`, у карточки коллекции или списка — `card.id`; ' +
        'обязательные данные кнопок — joints.md#кнопки',
    );
  });

  it('параметр в любом виде — выражением или строкой — без проблем', async () => {
    const dynamic = '<button type="button" data-action="cart.add" data-product-id={card.id}>В корзину</button>';
    const literal = '<button type="button" data-action="cart.add" data-product-id="p-1">В корзину</button>';
    expect(missing(await problemsOf(cards(dynamic)))).toEqual([]);
    expect(missing(await problemsOf(cards(literal)))).toEqual([]);
  });

  it('событие перед именем и несколько действий на элементе — каждое сверяется', async () => {
    const body = '<button type="button" data-action="click:cart.add favorites.toggle cart.open">В корзину</button>';
    expect(missing(await problemsOf(body))).toEqual([
      expect.stringContaining('кнопка `cart.add` без `data-product-id`'),
      expect.stringContaining('кнопка `favorites.toggle` без `data-product-id`'),
    ]);
  });

  it('у действия два обязательных — по отказу на каждый', async () => {
    const body = '<button type="button" data-action="cart.change">+</button>';
    expect(missing(await problemsOf(body))).toEqual([
      expect.stringContaining('без `data-line-id`'),
      expect.stringContaining('без `data-quantity`'),
    ]);
  });

  it('строка списка в <template> и элемент с data-ref у секции со скриптом — атрибуты ставит скрипт, не отказ', async () => {
    const inTemplate =
      '<ul data-ref="lines"><template><li><button type="button" data-action="cart.remove">Удалить</button></li></template></ul>';
    expect(missing(await problemsOf(inTemplate, true))).toEqual([]);
    const withRef = '<button type="button" data-ref="buy" data-action="cart.add">В корзину</button>';
    expect(missing(await problemsOf(withRef, true))).toEqual([]);
  });

  it('data-ref без скрипта — атрибут ставить некому, отказ', async () => {
    const body = '<button type="button" data-ref="buy" data-action="cart.add">В корзину</button>';
    expect(missing(await problemsOf(body))).toEqual([expect.stringContaining('без `data-product-id`')]);
  });

  it('действие без обязательных и своё действие секции — без проблем', async () => {
    const body =
      '<a href="/cart" data-action="cart.open">Корзина</a><button type="button" data-action="search.open">Поиск</button>';
    expect(missing(await problemsOf(body))).toEqual([]);
  });

  it('у кода есть справка со ссылкой на стыки', () => {
    expect(PROBLEM_INFO['action-param-missing'].doc).toBe('joints.md#кнопки');
  });
});
