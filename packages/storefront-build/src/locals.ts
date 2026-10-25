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
  // База страницы (блок 4 «Секций и SDK», Р4-12): preflight и база словаря — <style id="merfy-base"> первым стилем.
  baseCss: string;
  // CSS шрифтов (блок 12): @font-face частями и подогнанный запасной — в <style id="merfy-fonts"> перед токенами.
  fontsCss: string;
  // Путь главного файла шрифта текста для <link rel="preload">; пустая строка — шрифт системный, ссылки нет.
  fontPreload: string;
  tokensCss: string;
  // Атрибуты выборов словаря у <html> (блок 6, часть 6б): data-card-style, data-motion-reveal и другие; тема печатает их
  // как есть. Нет — без атрибутов (заготовки тестов).
  attributes?: Record<string, string>;
  // Код секций страницы после токенов: стили секций и тег бандла страницы (блок 5 «Секций и SDK», часть 5б). Пустая
  // строка — на странице нет ни секций, ни бандла.
  codeHtml: string;
  social: ShopSocial;
  // Разметка для поиска страницы записи (блок 8 «Секций и SDK», часть 8б-2): готовая строка
  // <script type="application/ld+json">…</script>, её пишет платформа (head.ts); тема печатает как есть. Нет — разметки нет.
  structuredData?: string;
}

// Теги для соцсетей (блок 9): og: и twitter:card. Заголовок, описание и адрес у них те же, что у страницы (title,
// description, canonical); здесь — остальное.
export interface ShopSocial {
  // og:type: у главной магазина — website.
  type: string;
  // og:site_name — имя магазина; мерчант его стёр — адрес магазина.
  siteName: string;
  // og:locale — язык страницы в форме соцсетей: ru-RU → ru_RU.
  locale: string;
  // og:image — логотип магазина по адресу https в PNG, JPEG, WebP или GIF. Пустая строка — тег не рисуется.
  image: string;
  // twitter:card: summary — карточка с маленькой картинкой, логотипу большая не подходит.
  card: string;
}

export interface ShopPageLocals {
  head: ShopPageHead;
  shop: { name: string };
  year: number;
  // Разметка секций страницы (блок 7) в порядке мерчанта: <merfy-section data-section="…">; тема печатает её в <main>.
  sections: string[];
  // Шапка и подвал (блок 1 «Секций и SDK», часть 4): разметка секций списков header и footer; тема печатает шапку до
  // <main>, подвал — после.
  header: string[];
  footer: string[];
  // Оформление заказа (блок 10, часть 10а, Р10а-17): данные страниц /checkout и /checkout-result; другие страницы
  // пишут без него.
  checkout?: CheckoutLocals;
}

// Объект JSON — свойства блоков оформления из ревизии (блок 10, Р10а-19).
export type JsonObject = Readonly<Record<string, unknown>>;

// Оформление заказа новой темы (блок 10, Р10а-17): те же блоки theme-base, что у пяти тем.
export interface CheckoutLocals {
  readonly result: boolean; // false — /checkout, true — /checkout-result
  readonly config: { readonly shopId: string; readonly apiUrl: string; readonly dadataToken: string };
  readonly varsCss: string; // таблица переменных пяти тем по схемам магазина (checkout-css.ts)
  // Свойства блоков из revision.checkout: на витрине — только header; в превью — все четыре (Р10а-19).
  readonly header: JsonObject;
  readonly layout: JsonObject;
  readonly form: JsonObject;
  readonly summary: JsonObject;
}

// Стенд темы в превью конструктора (design.md блока 8, П8-1 А): та же серверная сборка темы рисует /theme-stand с
// правками мерчанта. Сборщик кладёт эти данные в Astro.locals.merfyStand; страница магазина их не видит.
export interface StandPageHead {
  title: string;
  configHtml: string;
  // CSS шрифтов (блок 12) — тот же, что у страницы магазина; файлы /_fonts/ сборщик превью вставляет data:-адресами.
  fontsCss: string;
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
