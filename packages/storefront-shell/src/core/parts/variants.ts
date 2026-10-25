import { type Failure, failureOf, failed, reportFailure } from '../failures';
import { type Atom, atom, readable } from '../stores';
import type {
  CoreHandle,
  Money,
  ProductVariants,
  Result,
  SdkPart,
  Variant,
  VariantOption,
  VariantsModule,
} from '../types';

// Модуль «Варианты» (блок 11 «Секций и SDK», часть 11б; design.md 11.6): варианты читаются из одного JSON страницы —
// тег data-merfy-variants сборки (page-variants.ts, часть 11а), без запросов к серверу. Группа и значение — их id из
// JSON. После выбора — merfy:variant:change; у товара страницы на опубликованном сайте — ?variant=<id> в адресе.

// Атрибут JSON вариантов страницы — тот же, что VARIANTS_ATTRIBUTE сборки (storefront-build, page-variants.ts).
export const VARIANTS_SELECTOR = 'script[type="application/json"][data-merfy-variants]';
export const VARIANT_PARAM = 'variant';

// Форма записи JSON страницы (часть 11а): options, variants, default. Проверка без приведения типов (RULES §3.6).
interface PageEntry {
  readonly options: readonly VariantOption[];
  readonly variants: readonly Variant[];
  readonly default: string | null;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item): item is string => typeof item === 'string');

function moneyOf(raw: unknown): Money | null {
  if (!isRecord(raw)) return null;
  const amount: unknown = raw.amount;
  const currency: unknown = raw.currency;
  return typeof amount === 'number' &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    typeof currency === 'string' &&
    currency !== ''
    ? { amount, currency }
    : null;
}

const withText = (money: Money) => ({
  ...money,
  text: `${Math.round(money.amount / 100).toLocaleString('ru-RU')} ₽`,
});

function priceOf(raw: unknown): Variant['price'] | null {
  const money = moneyOf(raw);
  return money === null ? null : withText(money);
}

function optionOf(raw: unknown): VariantOption | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !Array.isArray(raw.values))
    return null;
  const values = raw.values.flatMap((item: unknown): readonly VariantOption['values'][number][] => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.value !== 'string' || !isStringList(item.images))
      return [];
    return [{ id: item.id, value: item.value, images: item.images }];
  });
  return { id: raw.id, name: raw.name, values };
}

function variantOf(raw: unknown, price: unknown, compareAt: unknown, available: unknown): Variant | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !isStringList(raw.options) || typeof available !== 'boolean')
    return null;
  const variantPrice = priceOf(price);
  if (variantPrice === null) return null;
  return { id: raw.id, options: raw.options, price: variantPrice, compareAtPrice: priceOf(compareAt), available };
}

function entryOf(raw: unknown): PageEntry | null {
  if (!isRecord(raw) || !Array.isArray(raw.options) || !Array.isArray(raw.variants)) return null;
  const options = raw.options.flatMap((item: unknown): readonly VariantOption[] => {
    const option = optionOf(item);
    return option === null ? [] : [option];
  });
  const variants = raw.variants.flatMap((item: unknown): readonly Variant[] => {
    if (!isRecord(item)) return [];
    const variant = variantOf(item, item.price, item.compareAtPrice, item.available);
    return variant === null ? [] : [variant];
  });
  const fallback: unknown = raw.default;
  return { options, variants, default: typeof fallback === 'string' ? fallback : null };
}

// JSON страницы читается один раз при первом of: нет тега — пустой набор; текст не JSON — пустой набор и одна строка
// в консоль; товар не по форме — товара нет, остальные есть.
function pageEntriesOf(): Readonly<Record<string, PageEntry>> {
  const tag = document.querySelector(VARIANTS_SELECTOR);
  if (tag === null || tag.textContent === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(tag.textContent);
  } catch (error) {
    console.error(
      `variants: JSON ${VARIANTS_SELECTOR} не разбирается: ${error instanceof Error ? error.message : 'не Error'}`,
    );
    return {};
  }
  if (!isRecord(parsed)) return {};
  const entries: Record<string, PageEntry> = {};
  Object.entries(parsed).forEach(([id, raw]) => {
    const entry = entryOf(raw);
    if (entry !== null) entries[id] = entry;
  });
  return entries;
}

const invalidOf = (message: string): Failure => failureOf('invalid', message);

// Стартовое сочетание (Р11б-3): ?variant= — только у товара страницы; неизвестный id — default; нет — первый вариант.
function initialOf(entry: PageEntry, urlVariant: string | null): Variant | null {
  const byId = (id: string | null): Variant | null => entry.variants.find((variant) => variant.id === id) ?? null;
  return byId(urlVariant) ?? byId(entry.default) ?? entry.variants[0] ?? null;
}

// Товар страницы (config.page.record вида product с этим id): у него ?variant= читается и пишется.
function isPageProduct(core: CoreHandle, productId: string): boolean {
  const record = core.config?.page.record;
  return record !== undefined && record.type === 'product' && record.id === productId;
}

function urlVariantOf(core: CoreHandle, productId: string): string | null {
  if (!isPageProduct(core, productId)) return null;
  return new URLSearchParams(window.location.search).get(VARIANT_PARAM);
}

// Адрес с ?variant=<id>: остальные параметры остаются; вызывается только на опубликованном сайте.
function replaceUrl(variantId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(VARIANT_PARAM, variantId);
  window.history.replaceState(window.history.state, '', url);
}

const variantById = (entry: PageEntry, id: string): Variant | null =>
  entry.variants.find((variant) => variant.id === id) ?? null;

const valueIdsOf = (entry: PageEntry, group: string): readonly string[] | null => {
  const found = entry.options.find((option) => option.id === group);
  return found === undefined ? null : found.values.map((value) => value.id);
};

// Ищем точное сочетание; нет — первое с этим значением: сначала в наличии, потом любое (Р11б-4).
function pickVariantOf(entry: PageEntry, group: string, value: string, current: readonly string[]): Variant | null {
  const at = entry.options.findIndex((option) => option.id === group);
  const exact = entry.variants.find(
    (variant) =>
      at >= 0 &&
      variant.options[at] === value &&
      variant.options.every((id, index) => index === at || id === current[index]),
  );
  if (exact !== undefined) return exact;
  const withValue = entry.variants.filter((variant) => at >= 0 && variant.options[at] === value);
  return withValue.find((variant) => variant.available) ?? withValue[0] ?? null;
}

// Картинки значения: у значения сочетания — картинки значения первой группы, где оно есть.
function imagesOfValue(entry: PageEntry, valueId: string): readonly string[] | null {
  for (const option of entry.options) {
    const found = option.values.find((value) => value.id === valueId);
    if (found !== undefined) return found.images;
  }
  return null;
}

// Выбор варианта: тот же id — молча; другой — событие и, у товара страницы, ?variant= (Р11б-4).
function selectOf(core: CoreHandle, store: Atom<Variant | null>, productId: string): (next: Variant) => Result<Variant> {
  return (next: Variant): Result<Variant> => {
    const current = store.get();
    store.set(next);
    if (current?.id === next.id) return { ok: true, data: next };
    core.emit('merfy:variant:change', { productId, variantId: next.id });
    if (core.mode === 'live' && isPageProduct(core, productId)) replaceUrl(next.id);
    return { ok: true, data: next };
  };
}

const failOf =
  (core: CoreHandle): ((message: string) => Result<Variant>) =>
  (message: string): Result<Variant> => {
    const failure = invalidOf(message);
    reportFailure(core, failure);
    return failed(failure);
  };

// Картинка сочетания: первая непустая среди картинок значений сочетания.
function imageForOf(entry: PageEntry, variant: Variant): { readonly url: string } | null {
  for (const valueId of variant.options) {
    const images = imagesOfValue(entry, valueId);
    if (images !== null && images.length > 0) return { url: images[0] };
  }
  return null;
}

function productVariantsOf(core: CoreHandle, productId: string, entry: PageEntry): ProductVariants {
  const store: Atom<Variant | null> = atom(initialOf(entry, urlVariantOf(core, productId)));
  const currentOptions = (): readonly string[] => store.get()?.options ?? [];
  const select = selectOf(core, store, productId);
  const fail = failOf(core);
  return {
    $variant: readable(store),
    options: entry.options,
    pick(group: string, value: string): Result<Variant> {
      const valueIds = valueIdsOf(entry, group);
      if (valueIds === null) return fail(`variants.pick: группы ${group} нет у товара ${productId}`);
      if (!valueIds.includes(value)) return fail(`variants.pick: значения ${value} нет в группе ${group}`);
      const next = pickVariantOf(entry, group, value, currentOptions());
      return next === null ? fail(`variants.pick: значения ${value} нет у товара ${productId}`) : select(next);
    },
    pickVariant(variantId: string): Result<Variant> {
      const next = variantById(entry, variantId);
      return next === null ? fail(`variants.pick: варианта ${variantId} нет у товара ${productId}`) : select(next);
    },
    isAvailable(group: string, value: string): boolean {
      const next = pickVariantOf(entry, group, value, currentOptions());
      return next?.available ?? false;
    },
    imageFor(variant: Variant) {
      return imageForOf(entry, variant);
    },
  };
}

export const variants: SdkPart<'variants', VariantsModule> = {
  name: 'variants',
  create: (core: CoreHandle): VariantsModule => {
    let entries: Readonly<Record<string, PageEntry>> | null = null;
    const cache = new Map<string, ProductVariants>();
    const of = (productId: string): ProductVariants | null => {
      if (entries === null) entries = pageEntriesOf();
      const cached = cache.get(productId);
      if (cached !== undefined) return cached;
      const entry = entries[productId];
      if (entry === undefined) return null;
      const created = productVariantsOf(core, productId, entry);
      cache.set(productId, created);
      return created;
    };
    return {
      of,
      pick(productId: string, group: string, value: string): Result<Variant> {
        const product = of(productId);
        if (product === null) {
          const failure = invalidOf(`variants.pick: товара ${productId} нет в JSON вариантов страницы`);
          reportFailure(core, failure);
          return failed(failure);
        }
        return product.pick(group, value);
      },
    };
  },
  markup: {
    pick: {
      params: ['product-id', 'group', 'value'],
      call: (api, values): Promise<Result<unknown>> =>
        Promise.resolve(api.pick(values['product-id'] ?? '', values.group ?? '', values.value ?? '')),
    },
  },
};
