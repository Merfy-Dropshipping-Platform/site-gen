// Контракт страницы «Каталог» (Catalog). Смысл настроек снят с эталона Rose:
// packages/theme-rose/blocks/Catalog/Catalog.astro (строки указаны).
// Каталог ГИДРИРУЕТСЯ (fetch реальных товаров тенанта — у гейтов 50 товаров,
// 6 коллекций) — каталожные чеки ждут наполнения сетки.
// Прогон: --page catalog (страница каталога в ревизии обоих сайтов).
export default {
  block: 'Catalog',
  fields: {
    categoryTitle: {
      label: 'Заголовок',
      values: ['Каталог проба Альфа', 'Каталог проба Бета'],
      meaning: 'введённый заголовок страницы каталога видим',
      check: { type: 'text-lands' },
    },
    categorySubtitle: {
      label: 'Текст',
      values: ['Подзаголовок каталога Альфа', 'Подзаголовок каталога Бета'],
      meaning: 'введённый подзаголовок видим (pickText, Catalog.astro:109)',
      also: { subtitle: 'true' },
      check: { type: 'text-lands' },
    },
    subtitle: {
      label: 'Подзаголовок',
      values: ['true', 'false'],
      meaning: 'тумблер видимости подзаголовка (subtitleVisible, Catalog.astro:110)',
      also: { categorySubtitle: 'Проба тумблера подзаголовка' },
      needle: 'Проба тумблера подзаголовка',
      check: { type: 'needle-visibility', needle: 'Проба тумблера подзаголовка', map: { true: true, false: false } },
    },
    cards: {
      label: 'Карточки',
      values: [4, 8],
      meaning: 'товаров на страницу пагинации (pageSize, Catalog.astro:93-97)',
      check: { type: 'hydrated-grid-count' },
    },
    columns: {
      label: 'Колонки',
      values: [2, 4],
      meaning: 'число колонок сетки товаров — плитки сужаются пропорционально',
      also: { cards: 8 },
      check: { type: 'tile-density' },
    },
    showFilter: {
      label: 'Фильтры',
      values: ['true', 'false'],
      meaning: 'тумблер панели фильтров (filterVisible, Catalog.astro:111)',
      also: { filterPosition: 'top' },
      // строка catalog-filters живёт и без фильтров (в ней сорт) — меряем
      // панель «Наличие» (реальные summary: Наличие/Стоимость/Цвет/Коллекции)
      needle: 'Наличие',
      check: { type: 'needle-visibility', needle: 'Наличие', map: { true: true, false: false } },
    },
    filterPosition: {
      label: 'Вид фильтра',
      values: ['side', 'top'],
      meaning: 'side = сайдбар слева от сетки; top = строка фильтров над сеткой (data-catalog-layout, Catalog.astro:117,217)',
      also: { showFilter: 'true' },
      check: { type: 'filter-position' },
    },
    showSort: {
      label: 'Сортировка',
      values: ['true', 'false'],
      meaning: 'тумблер сортировки (sortVisible, Catalog.astro:112)',
      also: { filterPosition: 'top', showFilter: 'true' },
      // разметка сорта = details/summary «По популярности» (слова «Сортировка» в DOM нет)
      needle: 'По популярности',
      check: { type: 'needle-visibility', needle: 'По популярности', map: { true: true, false: false } },
    },
    collectionSlug: {
      label: 'Выбор коллекции',
      values: ['smartfony', 'naushniki'],
      meaning: 'коллекция каталога — набор товаров реально меняется (слаги тенанта гейта)',
      check: { type: 'grid-content-differs' },
    },
    'productCard.quickAdd': {
      label: 'Карточка · быстрое добавление',
      values: ['standard', 'none'],
      meaning: 'кнопка на карточках (маркер data-quick-add-id, НЕ data-add-to-cart): none | standard | cart — Catalog.astro:165-167,751',
      check: { type: 'selector-visibility', mediaSelector: '[data-quick-add-id]', map: { standard: true, none: false } },
    },
    'productCard.buttonStyle': {
      label: 'Карточка · стиль кнопки',
      values: ['primary', 'secondary'],
      meaning: 'primary = чёрная заливка; secondary = белая с обводкой (Catalog.astro:147-149)',
      also: { 'productCard.quickAdd': 'standard' },
      check: { type: 'scheme-change', mediaSelector: '[data-quick-add-id]' },
    },
    'productCard.cardStyle': {
      label: 'Карточка · стиль (аспект фото)',
      values: ['wide', 'square', 'portrait'],
      meaning: 'аспект фото карточки: wide 4/3 → square 1/1 → portrait 318/444 (Catalog.astro:141-145) — шире → вытянутее',
      check: { type: 'media-aspect-order', mediaSelector: 'li[data-product-id] a' },
    },
    'productCard.cardBackground': {
      label: 'Карточка · фон',
      values: ['false', 'true'],
      meaning: 'фон-плашка карточки включается',
      check: { type: 'scheme-change', mediaSelector: 'li[data-product-id] article, li[data-product-id] > div, [data-nt$="product-card"]' },
    },
    padding: {
      label: 'Отступы',
      values: [{ top: 0, bottom: 0 }, { top: 80, bottom: 80 }],
      meaning: 'внутренние отступы страницы каталога',
      check: { type: 'padding-delta' },
    },
    containerColorScheme: {
      label: 'Цветовая схема контейнера',
      values: ['scheme-1', 'scheme-2', 'scheme-4'],
      meaning: 'схема внутреннего контейнера (рендерит сам блок, класс на внутреннем div)',
      check: { type: 'scheme-change', mediaSelector: '[class*="color-scheme"]' },
    },
  },
  uncovered: {
    'productCard.nextPhoto': 'второе фото при наведении = интерактив (hover), вне волны 1',
    'productCard.nextPhotoMode': 'режим смены фото = интерактив (hover), вне волны 1',
    colorScheme: 'внешнюю схему вешает компоновщик страницы — page-tier волна',
  },
};
