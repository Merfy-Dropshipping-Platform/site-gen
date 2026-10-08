// Что страница магазина новой темы получает от рисовальщика (design.md блока 4, В4-4 Б): Astro.locals.merfy — её
// единственный вход. Всё индексируемое (SEO) уже здесь: страница печатает, а не считает.

export interface ShopPageHead {
  lang: string;
  title: string;
  // Пустая строка — мерчант описание не заполнил: тег <meta name="description"> не рисуется (seo.ts).
  description: string;
  // Ключевые слова мерчанта; пустая строка — не заполнил: тег <meta name="keywords"> не рисуется (seo.ts).
  keywords: string;
  canonical: string;
  configHtml: string;
  tokensCss: string;
}

export interface ShopPageLocals {
  head: ShopPageHead;
  shop: { name: string };
  year: number;
}
