import { describe, expect, it } from 'vitest';
import { BADGE_LABELS, filterKeyOf, pageFiltersOf, snapshotFilters, type FilterContext } from '../src/list-filters';
import { LIST_BADGES, listQueryString, parseListQuery, type ListQuery } from '../src/list-query';

// Динамичные фильтры списка (контракт фильтров каталога, часть 1, п. 5): ответ product.getFilters → один вид с
// параметрами адреса витрины и ссылками «выбрать / снять»; незнакомое проходит как есть.
const C1 = 'c-1';
const C2 = 'c-2';
const SLUGS: Record<string, string> = { [C1]: 'kashemir', [C2]: 'len' };

function contextOf(list: string, catalog = true): FilterContext {
  return {
    query: parseListQuery(new URLSearchParams(list)),
    addressOf: (query: ListQuery) => {
      const params = listQueryString({ ...query, page: 1 });
      return params === '' ? '/catalog' : `/catalog?${params}`;
    },
    slugOf: (id) => SLUGS[id] ?? null,
    catalog,
  };
}

const option = (value: string, label: string, count: number, selected = false) => ({ value, label, count, selected });
// filter.цвет=Синий в каноническом виде.
const BLUE = `${encodeURIComponent('filter.цвет')}=${encodeURIComponent('Синий')}`;

const PRICE = {
  key: 'price',
  kind: 'price',
  type: 'range',
  label: 'Цена',
  params: { min: 'min_price', max: 'max_price' },
  min: 1900,
  max: 5000.5,
};
const BADGE = {
  key: 'badge',
  kind: 'badge',
  type: 'flags',
  label: 'Подборки',
  param: 'badge',
  options: [option('sale', 'Со скидкой', 3), option('new', 'Новинки', 2)],
};
const COLLECTION = {
  key: 'collection',
  kind: 'collection',
  type: 'list',
  label: 'Коллекции',
  param: 'collection_id',
  options: [option(C1, 'Кашемир', 4, true), option('c-net', 'Без записи', 1), option(C2, 'Лён', 2)],
};
const TAGS = {
  key: 'tags',
  kind: 'tag',
  type: 'list',
  label: 'Теги',
  param: 'tags',
  options: [option('leto', 'leto', 5)],
};
const COLOR = {
  key: 'цвет',
  kind: 'variant',
  type: 'list',
  label: 'Цвет',
  param: 'цвет',
  options: [option('Синий', 'Синий', 2, true), option('Белый', 'Белый', 1)],
};
const REPLY = [PRICE, BADGE, COLLECTION, TAGS, COLOR];

describe('фильтры из ответа product.getFilters', () => {
  it('порядок сервиса; параметры — адреса витрины; у значения — ссылка выбрать / снять', () => {
    const filters = pageFiltersOf(REPLY, contextOf('collection=kashemir&filter.цвет=Синий&min_price=2000'));
    expect(filters.map((filter) => [filter.key, 'param' in filter ? filter.param : filter.params])).toEqual([
      ['price', { min: 'min_price', max: 'max_price' }],
      ['badge', 'badge'],
      ['collection', 'collection'],
      ['tags', 'tag'],
      ['цвет', 'filter.цвет'],
    ]);
    const [price, badge, collection, tags, color] = filters;
    expect(price).toEqual({
      ...PRICE,
      clearUrl: '/catalog?collection=kashemir&filter.%D1%86%D0%B2%D0%B5%D1%82=%D0%A1%D0%B8%D0%BD%D0%B8%D0%B9',
    });
    expect(badge).toMatchObject({ clearUrl: null });
    expect(badge && 'options' in badge ? badge.options[0] : null).toEqual({
      value: 'sale',
      label: 'Со скидкой',
      count: 3,
      selected: false,
      url: '/catalog?badge=sale&collection=kashemir&filter.%D1%86%D0%B2%D0%B5%D1%82=%D0%A1%D0%B8%D0%BD%D0%B8%D0%B9&min_price=2000',
    });
    // Коллекции: id → адрес записи; без записи — значения нет; выбранное снимается ссылкой.
    expect(collection && 'options' in collection ? collection.options : []).toMatchObject([
      {
        value: 'kashemir',
        label: 'Кашемир',
        count: 4,
        selected: true,
        url: `/catalog?${BLUE}&min_price=2000`,
      },
      { value: 'len', selected: false, url: `/catalog?collection=kashemir&collection=len&${BLUE}&min_price=2000` },
    ]);
    expect(tags && 'options' in tags ? tags.options[0]?.url : null).toContain('tag=leto');
    expect(color).toMatchObject({
      kind: 'variant',
      label: 'Цвет',
      clearUrl: '/catalog?collection=kashemir&min_price=2000',
    });
    expect(color && 'options' in color ? color.options.map((value) => [value.value, value.selected]) : []).toEqual([
      ['Синий', true],
      ['Белый', false],
    ]);
  });

  it('снять последнее выбранное — адрес списка без параметров', () => {
    const [badge] = pageFiltersOf([BADGE], contextOf('badge=sale'));
    expect(badge && 'options' in badge ? badge.options.map((value) => [value.selected, value.url]) : []).toEqual([
      [true, '/catalog'],
      [false, '/catalog?badge=sale&badge=new'],
    ]);
    expect(badge?.clearUrl).toBe('/catalog');
  });

  it('незнакомые kind и поля — как есть: список идёт параметром filter.<param>, диапазон — без ссылок', () => {
    const attribute = {
      key: 'strana',
      kind: 'attribute',
      type: 'list',
      label: 'Страна',
      param: 'strana',
      hint: 'новое поле',
      options: [{ ...option('Италия', 'Италия', 2), swatch: { hex: '#ffffff', image: null } }],
    };
    const weight = {
      key: 'ves',
      kind: 'attribute',
      type: 'range',
      label: 'Вес',
      params: { min: 'ves_min', max: 'ves_max' },
      min: 1,
      max: 9,
      histogram: [1, 2],
    };
    const bare = { ...weight, key: 'bez', params: 'не объект' };
    const [list, range, broken] = pageFiltersOf([attribute, weight, bare], contextOf('filter.strana=Италия'));
    expect(list).toMatchObject({ hint: 'новое поле', param: 'filter.strana', clearUrl: '/catalog' });
    expect(list && 'options' in list ? list.options[0] : null).toEqual({
      value: 'Италия',
      label: 'Италия',
      count: 2,
      selected: true,
      swatch: { hex: '#ffffff', image: null },
      url: '/catalog',
    });
    expect(range).toEqual({ ...weight, clearUrl: null });
    expect(broken).toMatchObject({ key: 'bez', params: { min: '', max: '' } });
  });

  it('не той формы — отброшено; фильтр без значений не отдаётся; коллекции — только у каталога', () => {
    const junk = [
      null,
      'строка',
      { key: '', kind: 'tag', type: 'list', label: 'x', param: 'tags', options: [option('a', 'a', 1)] },
      { ...PRICE, min: 'дёшево' },
      { ...TAGS, options: [{ value: 'a' }, option('b', 'b', -1)] },
      { ...COLLECTION, options: [option('c-net', 'Без записи', 1)] },
    ];
    expect(pageFiltersOf(junk, contextOf(''))).toEqual([]);
    expect(pageFiltersOf(REPLY, contextOf('', false)).map((filter) => filter.key)).toEqual([
      'price',
      'badge',
      'tags',
      'цвет',
    ]);
  });

  it('признак не из LIST_BADGES в адрес не пишется: ссылка — текущий список', () => {
    const [badge] = pageFiltersOf([{ ...BADGE, options: [option('hit', 'Хит', 1)] }], contextOf('q=x'));
    expect(badge && 'options' in badge ? badge.options[0]?.url : null).toBe('/catalog?q=x');
  });

  it('подписи признаков — по контракту, на каждый признак', () => {
    expect(LIST_BADGES.map((badge) => BADGE_LABELS[badge])).toEqual([
      'Со скидкой',
      'Новинки',
      'Мало осталось',
      'Предзаказ',
      'В наличии',
    ]);
  });
});

describe('фильтры снимка записей сборки', () => {
  const products = [
    {
      price: 1900,
      groups: [{ key: 'цвет', name: 'цвет', values: ['Синий', 'Белый'] }],
    },
    {
      price: 5000,
      groups: [
        { key: 'цвет', name: 'Цвет', values: ['Синий'] },
        { key: 'размер обуви', name: 'Размер обуви', values: ['41', '41'] },
      ],
    },
    { price: 3000, groups: [] },
  ];

  it('вид ответа сервиса: цена, группы по имени; счётчик — товаров списка со значением; коллекций нет', () => {
    expect(snapshotFilters(products)).toEqual([
      { ...PRICE, min: 1900, max: 5000 },
      {
        key: 'размер обуви',
        kind: 'variant',
        type: 'list',
        label: 'Размер обуви',
        param: 'размер обуви',
        options: [option('41', '41', 1)],
      },
      // Подпись — наименьшее из названий, как MIN(vg.name) сервиса.
      { ...COLOR, options: [option('Белый', 'Белый', 1), option('Синий', 'Синий', 2)] },
    ]);
  });

  it('ключ группы — как у сервиса: нижний регистр, пробелы не заменяются; ссылка — filter.<ключ>', () => {
    expect(filterKeyOf('Размер Обуви')).toBe('размер обуви');
    const [, shoes] = pageFiltersOf(snapshotFilters(products), contextOf(''));
    expect(shoes).toMatchObject({ param: 'filter.размер обуви' });
    expect(shoes && 'options' in shoes ? shoes.options[0]?.url : null).toBe(
      `/catalog?${encodeURIComponent('filter.размер обуви')}=41`,
    );
  });

  it('товаров нет — ни цены, ни значений; через pageFiltersOf — пустой список', () => {
    expect(pageFiltersOf(snapshotFilters([]), contextOf(''))).toEqual([]);
  });
});
