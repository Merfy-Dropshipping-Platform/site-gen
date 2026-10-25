import type { StorefrontConfig } from '@merfy/storefront-config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VARIANTS_SELECTOR, variants } from '../src/core/parts/variants';
import { fakeCore, storefrontConfig } from './sdk-support';

// Модуль «Варианты» (блок 11 «Секций и SDK», часть 11б; design.md 11.6): JSON вариантов страницы → выбранное сочетание,
// выбор значения, наличие, фото; ?variant= у товара страницы; merfy:variant:change.
const money = (amount: number) => ({ amount, currency: 'RUB', text: `${Math.round(amount / 100).toLocaleString('ru-RU')} ₽` });
const NOVA = {
  options: [
    { id: 'color', name: 'Цвет', values: [{ id: 'grey', value: 'серый', images: [] }, { id: 'blue', value: 'синий', images: ['https://s3.merfy.ru/p/blue.jpg'] }] },
    { id: 'length', name: 'Длина', values: [{ id: '150', value: '150 см', images: [] }, { id: '180', value: '180 см', images: [] }] },
  ],
  variants: [
    { id: 'v-grey-150', options: ['grey', '150'], price: money(190000), compareAtPrice: null, available: true },
    { id: 'v-grey-180', options: ['grey', '180'], price: money(230000), compareAtPrice: null, available: false },
    { id: 'v-blue-150', options: ['blue', '150'], price: money(190000), compareAtPrice: null, available: true },
    { id: 'v-blue-180', options: ['blue', '180'], price: money(230000), compareAtPrice: money(260000), available: true },
  ],
  default: 'v-grey-150',
};
const PAGE_PRODUCT: StorefrontConfig = {
  ...storefrontConfig('live'),
  page: { id: 'product', path: '/product/nova', record: { type: 'product', id: 'p-nova' } },
};

function pageWith(json: unknown, search = ''): void {
  document.head.innerHTML = `<script type="application/json" data-merfy-variants>${typeof json === 'string' ? json : JSON.stringify(json)}</script>`;
  window.history.replaceState(null, '', `/product/nova${search}`);
}

function moduleOf(config: StorefrontConfig = PAGE_PRODUCT, mode: 'live' | 'preview' = 'live') {
  const fake = fakeCore(mode, config);
  return { api: variants.create(fake.core), ...fake };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.head.replaceChildren();
  window.history.replaceState(null, '', '/');
});

describe('ctx.variants.of', () => {
  it('товар из JSON: группы, сочетание по умолчанию; тот же объект при повторном вызове; чужой товар — null', () => {
    pageWith({ 'p-nova': NOVA });
    const { api } = moduleOf();
    const nova = api.of('p-nova');
    expect(nova?.options.map((option) => option.name)).toEqual(['Цвет', 'Длина']);
    expect(nova?.$variant.get()?.id).toBe('v-grey-150');
    expect(api.of('p-nova')).toBe(nova);
    expect(api.of('p-other')).toBeNull();
  });

  it('?variant= у товара страницы — это сочетание; неизвестный id — по умолчанию; у другого товара — не читается', () => {
    pageWith({ 'p-nova': NOVA, 'p-pled': { ...NOVA, default: 'v-blue-150' } }, '?variant=v-blue-180&utm_source=vk');
    const { api } = moduleOf();
    expect(api.of('p-nova')?.$variant.get()?.id).toBe('v-blue-180');
    expect(api.of('p-pled')?.$variant.get()?.id).toBe('v-blue-150');
    pageWith({ 'p-nova': NOVA }, '?variant=net-takogo');
    expect(moduleOf().api.of('p-nova')?.$variant.get()?.id).toBe('v-grey-150');
  });

  it('нет тега — of → null молча; не JSON — null и одна строка в консоль; товар не по форме — без него', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(moduleOf().api.of('p-nova')).toBeNull();
    pageWith('{ не json');
    const broken = moduleOf().api;
    expect([broken.of('p-nova'), broken.of('p-pled')]).toEqual([null, null]);
    expect(error).toHaveBeenCalledTimes(1);
    pageWith({ 'p-nova': NOVA, 'p-bad': { options: 'x' } });
    const mixed = moduleOf().api;
    expect([mixed.of('p-bad'), mixed.of('p-nova') === null]).toEqual([null, false]);
  });
});

describe('выбор значения', () => {
  it('pick — значение группы, остальные как были; событие; адрес — ?variant= с прочими параметрами', () => {
    pageWith({ 'p-nova': NOVA }, '?utm_source=vk');
    const { api, named } = moduleOf();
    const nova = api.of('p-nova');
    expect(nova?.pick('color', 'blue')).toMatchObject({ ok: true, data: { id: 'v-blue-150' } });
    expect(nova?.pick('length', '180')).toMatchObject({ ok: true, data: { id: 'v-blue-180' } });
    expect(named('merfy:variant:change')).toEqual([
      { productId: 'p-nova', variantId: 'v-blue-150' },
      { productId: 'p-nova', variantId: 'v-blue-180' },
    ]);
    expect(window.location.search).toBe('?utm_source=vk&variant=v-blue-180');
    nova?.pick('length', '180');
    expect(named('merfy:variant:change')).toHaveLength(2);
  });

  it('сочетания нет — первое с этим значением, сначала в наличии; неизвестные группа или значение — invalid', () => {
    const sparse = { ...NOVA, variants: NOVA.variants.filter((variant) => variant.id !== 'v-grey-150'), default: 'v-blue-150' };
    pageWith({ 'p-nova': sparse });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const nova = moduleOf().api.of('p-nova');
    expect(nova?.pick('color', 'grey')).toMatchObject({ ok: true, data: { id: 'v-grey-180' } });
    expect(nova?.pick('color', 'red')).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(nova?.pick('size', 'M')).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(nova?.pickVariant('net')).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(nova?.pickVariant('v-blue-180')).toMatchObject({ ok: true });
  });

  it('isAvailable — при прочих выбранных; imageFor — первое значение с фото', () => {
    pageWith({ 'p-nova': NOVA });
    const nova = moduleOf().api.of('p-nova');
    expect([nova?.isAvailable('length', '180'), nova?.isAvailable('length', '150')]).toEqual([false, true]);
    nova?.pick('color', 'blue');
    expect(nova?.isAvailable('length', '180')).toBe(true);
    const variant = nova?.$variant.get();
    expect(variant === null || variant === undefined ? null : nova?.imageFor(variant)).toEqual({ url: 'https://s3.merfy.ru/p/blue.jpg' });
    nova?.pick('color', 'grey');
    const grey = nova?.$variant.get();
    expect(grey === null || grey === undefined ? 'нет' : nova?.imageFor(grey)).toBeNull();
  });

  it('превью и не товар страницы — адрес не меняется; товар без вариантов — $variant null', () => {
    pageWith({ 'p-nova': NOVA, 'p-plain': { options: [], variants: [], default: null } });
    const preview = moduleOf(PAGE_PRODUCT, 'preview').api;
    preview.of('p-nova')?.pick('color', 'blue');
    expect(window.location.search).toBe('');
    const live = moduleOf({ ...PAGE_PRODUCT, page: { id: 'home', path: '/' } }).api;
    live.of('p-nova')?.pick('color', 'blue');
    expect(window.location.search).toBe('');
    expect(live.of('p-plain')?.$variant.get()).toBeNull();
  });
});

describe('data-action="variants.pick"', () => {
  it('параметры product-id, group, value; товара нет — invalid', async () => {
    pageWith({ 'p-nova': NOVA });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { api } = moduleOf();
    const markup = variants.markup?.pick;
    expect(markup?.params).toEqual(['product-id', 'group', 'value']);
    const call = (values: Record<string, string>) => markup?.call(api, values);
    expect(await call({ 'product-id': 'p-nova', group: 'color', value: 'blue' })).toMatchObject({ ok: true });
    expect(await call({ 'product-id': 'p-net', group: 'color', value: 'blue' })).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(api.pick('p-nova', 'length', '180')).toMatchObject({ ok: true, data: { id: 'v-blue-180' } });
    expect(api.of('p-nova')?.$variant.get()?.id).toBe('v-blue-180');
    expect(VARIANTS_SELECTOR).toBe('script[type="application/json"][data-merfy-variants]');
  });
});
