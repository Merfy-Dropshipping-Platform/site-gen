import { defaultVariantId, type Money, type ProductRecord } from './records';

// Варианты товаров страницы (блок 11 «Секций и SDK», часть 11а; design.md 11.6, 14г А): один JSON на страницу — товар
// страницы и товары полей вида product её секций. Читает модуль «Варианты» ядра секций (план 11б,
// @merfy/shell/core parts/variants.ts). Договор: поля можно добавить, менять нельзя.
export const VARIANTS_ATTRIBUTE = 'data-merfy-variants';
export const VARIANTS_NOTICE_BYTES = 32 * 1024;

export interface PageVariantValue {
  id: string;
  value: string;
  images: string[];
}
export interface PageVariantOption {
  id: string;
  name: string;
  values: PageVariantValue[];
}
export interface PageVariant {
  id: string;
  // id значений по порядку групп options.
  options: string[];
  price: Money;
  compareAtPrice: Money | null;
  available: boolean;
}
export interface PageVariantsEntry {
  options: PageVariantOption[];
  variants: PageVariant[];
  // defaultVariantId (page-list.ts); вариантов нет — null.
  default: string | null;
}
export type PageVariants = Record<string, PageVariantsEntry>;

// Вариант записи — id значений по порядку групп: значение группы — по options записи (название группы → значение, без
// пробелов по краям); значение не нашлось — null, варианта в JSON нет.
const variantOptionIds = (product: ProductRecord, options: Record<string, string>): string[] | null => {
  const ids: string[] = [];
  for (const group of product.options) {
    const value = (options[group.name] ?? '').trim();
    const found = group.values.find((candidate) => candidate.value === value)?.id;
    if (found === undefined) return null;
    ids.push(found);
  }
  return ids;
};

const entryOf = (product: ProductRecord): PageVariantsEntry => ({
  options: product.options.map((group) => ({
    id: group.id,
    name: group.name,
    values: group.values.map((value) => ({ id: value.id, value: value.value, images: value.images })),
  })),
  variants: product.variants.flatMap((variant) => {
    const options = variantOptionIds(product, variant.options);
    return options === null
      ? []
      : [
          {
            id: variant.id,
            options,
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            available: variant.available,
          },
        ];
  }),
  default: defaultVariantId(product),
});

// Записи → JSON: у варианта значение группы — по options записи (название группы → значение, без пробелов по краям);
// значение не нашлось — варианта нет в JSON. Товар без вариантов — тоже в JSON (variants: [], default: null).
export function pageVariantsOf(products: readonly ProductRecord[]): PageVariants {
  return Object.fromEntries(products.map((product) => [product.id, entryOf(product)]));
}

// «<» в тексте JSON — \u003c: тег <script> не закрылся значением.
const escapeJsonForTag = (text: string): string => text.replaceAll('<', '\\u003c');

// <script type="application/json" data-merfy-variants>…</script>; пусто — ''.
export function variantsTagOf(variants: PageVariants): string {
  if (Object.keys(variants).length === 0) return '';
  const json = escapeJsonForTag(JSON.stringify(variants));
  return `<script type="application/json" ${VARIANTS_ATTRIBUTE}>${json}</script>`;
}
