import {
  findPreviewRecord,
  isRecordType,
  recordIndex,
  type BuildInputs,
  type ProductRecord,
  type RecordEntry,
} from '@merfy/storefront-build';
import { SAMPLE_CART_LINES, sampleTagOf, type LookCartLine, type LookSample } from './look/look-sample';

// Что превью сообщает снимку черновика (`look/look-sample.ts`): какая запись показана и корзина из товаров магазина.
// Тег кладётся только на страницы, где это нужно, — остальные страницы превью не меняются.

const CART_PAGES: ReadonlySet<string> = new Set(['page-cart', 'page-checkout']);

const titleOf = (entry: RecordEntry | null): string | null => {
  const title: unknown = entry === null ? null : Reflect.get(entry.record, 'title');
  return typeof title === 'string' ? title : null;
};

// Сочетание в корзину: с остатком, иначе первое; у товара без вариантов — null.
function lineOf(product: ProductRecord, at: number): LookCartLine {
  const variant = product.variants.find((candidate) => candidate.available) ?? product.variants[0];
  return {
    id: `look-line-${at + 1}`,
    productId: product.id,
    variantCombinationId: variant?.id ?? null,
    quantity: 1,
    unitPriceCents: (variant?.price ?? product.price).amount,
    name: product.title,
    imageUrl: product.images[0] ?? null,
    options: variant?.options ?? {},
  };
}

// Первые товары магазина: сначала с остатком, как их покупают; без остатка — только если других нет.
function cartLinesOf(inputs: BuildInputs): LookCartLine[] {
  const products = recordIndex(inputs).products.map((entry) => entry.record);
  const ordered = [
    ...products.filter((product) => product.available),
    ...products.filter((product) => !product.available),
  ];
  return ordered.slice(0, SAMPLE_CART_LINES).map(lineOf);
}

// `platform` — id экземпляров секций платформы на странице (`platformIdsOf`).
export function previewSampleTag(
  inputs: BuildInputs,
  page: string,
  record: string | null,
  platform: readonly string[] = [],
): string {
  const sample: LookSample = { v: 1 };
  if (isRecordType(page) && record !== null) {
    const found = findPreviewRecord(inputs, page, record);
    sample.record = { type: page, asked: record, found: found !== null, title: titleOf(found) };
  }
  if (CART_PAGES.has(page)) sample.cart = { lines: cartLinesOf(inputs) };
  if (platform.length > 0) sample.platform = [...platform];
  const empty = sample.record === undefined && sample.cart === undefined && sample.platform === undefined;
  return empty ? '' : sampleTagOf(sample);
}

const WRAPPER_TAG = /<merfy-section\b[^>]*>/g;

const attributeOf = (tag: string, name: string): string | null =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

// Экземпляры секций на странице: id и полное имя с обёртки (`data-section-id`, `data-section`).
function placedOn(html: string): Array<{ id: string; name: string }> {
  return [...html.matchAll(WRAPPER_TAG)].flatMap(([tag]) => {
    const id = attributeOf(tag, 'data-section-id');
    const name = attributeOf(tag, 'data-section');
    return id === null || name === null ? [] : [{ id, name }];
  });
}

// Секции платформы на странице (19.11): библиотечные, которые в магазине не меняли. Какие секции такие — решает
// `unchanged` по именам секций страницы; роль секции (`data-role`) тут ни при чём: своя корзина агента — его секция.
export async function platformIdsOf(
  html: string,
  unchanged: (names: readonly string[]) => Promise<ReadonlySet<string>>,
): Promise<string[]> {
  const placed = placedOn(html);
  const library = await unchanged([...new Set(placed.map((section) => section.name))]);
  return placed.filter((section) => library.has(section.name)).map((section) => section.id);
}
