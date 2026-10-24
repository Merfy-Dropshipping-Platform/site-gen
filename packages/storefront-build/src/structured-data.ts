import { escapeScriptJson } from '@merfy/storefront-config';
import type { RecordEntry, RecordEntryOf } from './records';

// Разметка для поиска страницы товара (блок 8 «Секций и SDK», часть 8б-2; design.md 8.6): JSON-LD Product — как у
// секции Product пяти тем на проде (site-gen origin/prod, packages/theme-base/blocks/Product/Product.headless.ts,
// buildJsonLd), плюс наличие по записи и адрес страницы. Пишет платформа, а не секция: секцию товара пишет ИИ, и
// разметку он может забыть. У других записей разметки нет.

const SCHEMA = 'https://schema.org';
const IN_STOCK = `${SCHEMA}/InStock`;
const OUT_OF_STOCK = `${SCHEMA}/OutOfStock`;

// Картинки для поиска — только по адресу https: заглушка data: и адреса http в разметку не идут.
const httpsImages = (images: readonly string[]): string[] =>
  images.filter((image) => URL.parse(image)?.protocol === 'https:');

// Предложение — только у товара с ценой, как на проде. Цена — целые рубли, как текст цены на странице (records.ts,
// money): поиск сверяет цену разметки с видимой.
function offersOf(entry: RecordEntryOf<'product'>, canonical: string): { offers?: Record<string, unknown> } {
  const { price, available } = entry.record;
  if (price.amount <= 0) return {};
  return {
    offers: {
      '@type': 'Offer',
      price: Math.round(price.amount / 100),
      priceCurrency: price.currency,
      availability: available ? IN_STOCK : OUT_OF_STOCK,
      url: canonical,
    },
  };
}

function productJsonLd(entry: RecordEntryOf<'product'>, canonical: string): Record<string, unknown> {
  const images = httpsImages(entry.record.images);
  return {
    '@context': SCHEMA,
    '@type': 'Product',
    name: entry.record.title,
    ...(entry.seo.description === '' ? {} : { description: entry.seo.description }),
    ...(images.length === 0 ? {} : { image: images }),
    url: canonical,
    ...offersOf(entry, canonical),
  };
}

// Готовый тег для <head>. JSON экранирован для <script> (escapeScriptJson конфига витрины): «</script>» в названии
// товара тег не закроет. Не товар или страница сайта — пустая строка.
export function productStructuredData(entry: RecordEntry | undefined, canonical: string): string {
  if (entry === undefined || entry.type !== 'product') return '';
  const json = escapeScriptJson(JSON.stringify(productJsonLd(entry, canonical)));
  return `<script type="application/ld+json">${json}</script>`;
}
