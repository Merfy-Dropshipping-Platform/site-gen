export interface YmlOffer {
  id: string;
  available: boolean;
  url: string;
  price: number;
  currencyId: 'RUB' | 'USD' | 'EUR';
  categoryId: number;
  name: string;
  description?: string;
  vendor?: string;
  pictures?: string[];
  barcode?: string; // GTIN
  modelName?: string;
}

export interface YmlCategory {
  id: number;
  name: string;
  parentId?: number;
}

export interface YmlShop {
  name: string;
  company: string;
  url: string;
  platform?: string;
  currencyId: 'RUB' | 'USD' | 'EUR';
  categories: YmlCategory[];
  offers: YmlOffer[];
}

export function buildYandexFeed(shop: YmlShop): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${now}">
<shop>
  <name>${esc(shop.name)}</name>
  <company>${esc(shop.company)}</company>
  <url>${esc(shop.url)}</url>
  ${shop.platform ? `<platform>${esc(shop.platform)}</platform>` : ''}
  <currencies>
    <currency id="${shop.currencyId}" rate="1" />
  </currencies>
  <categories>
    ${shop.categories
      .map(
        (c) =>
          `<category id="${c.id}"${c.parentId ? ` parentId="${c.parentId}"` : ''}>${esc(c.name)}</category>`,
      )
      .join('\n    ')}
  </categories>
  <offers>
    ${shop.offers
      .map(
        (o) => `<offer id="${o.id}" available="${o.available}">
      <url>${esc(o.url)}</url>
      <price>${o.price}</price>
      <currencyId>${o.currencyId}</currencyId>
      <categoryId>${o.categoryId}</categoryId>
      ${(o.pictures ?? []).map((p) => `<picture>${esc(p)}</picture>`).join('\n      ')}
      <name>${esc(o.name)}</name>
      ${o.description ? `<description>${esc(o.description)}</description>` : ''}
      ${o.vendor ? `<vendor>${esc(o.vendor)}</vendor>` : ''}
      ${o.barcode ? `<barcode>${o.barcode}</barcode>` : ''}
      ${o.modelName ? `<model>${esc(o.modelName)}</model>` : ''}
    </offer>`,
      )
      .join('\n    ')}
  </offers>
</shop>
</yml_catalog>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
