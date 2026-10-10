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

// Стенд темы в превью конструктора (design.md блока 8, П8-1 А): та же серверная сборка темы рисует /theme-stand с
// правками мерчанта. Сборщик кладёт эти данные в Astro.locals.merfyStand; страница магазина их не видит.
export interface StandPageHead {
  title: string;
  configHtml: string;
  // CSS токенов темы с правками мерчанта — в <style id="merfy-tokens">.
  tokensCss: string;
  // Слушатель превью: правка токенов из конструктора без перезагрузки. Строкой — в коде темы сети нет (сторож).
  previewScript: string;
}

export interface StandPageLocals {
  head: StandPageHead;
  // Атрибуты выборов у <html>: data-card-style, data-card-align и другие.
  attributes: Record<string, string>;
  // Настройки не про вид: умолчание схемы панели ⊕ правка мерчанта, по id поля.
  settings: Record<string, string | boolean>;
  shop: { name: string };
  schemes: string[];
  // Поля раздела «Конфиг магазина»: shop.name, mode, theme.version, page.id.
  config: Record<string, string>;
  // Правки из ревизии, которые теме не подошли: стенд печатает их, а не падает.
  problems: string[];
}
