// Контракт секции «Товар» (Product). Смысл настроек снят с эталона Rose
// (порт themes/rose — Product рендерится и без товара тенанта: демо/плейсхолдер).
// Прогон: rose — страница product (в home-сиде rose блока нет), flux — home.
//   node theme-registry/run.mjs --theme rose --block Product --page product
//   node theme-registry/run.mjs --theme flux --block Product
export default {
  block: 'Product',
  fields: {
    size: {
      label: 'Размер',
      values: ['small', 'medium', 'large'],
      meaning: 'ширина колонки главного фото: 440/552/640 (--product-main-image-size, Figma 648:55733)',
      check: { type: 'media-width-monotonic', mediaSelector: '[data-product-images]' },
    },
    photoPosition: {
      label: 'Позиция фото',
      values: ['left', 'right'],
      meaning: 'главное фото слева ↔ справа от инфо-колонки',
      check: { type: 'media-side', mediaSelector: '[data-product-images]' },
    },
    'text.content': {
      label: 'Текст · содержимое',
      values: ['Текст товара проба Альфа', 'Текст товара проба Бета'],
      meaning: 'введённый текст секции видим',
      check: { type: 'text-lands' },
    },
    'text.size': {
      label: 'Текст · размер',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль текста секции растёт',
      also: { 'text.content': 'Проба кегля текста товара' },
      check: { type: 'monotonic-font', target: 'needle', needlePath: 'text.content' },
    },
    'title.size': {
      label: 'Название · размер',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль названия товара растёт',
      check: { type: 'monotonic-font', target: 'heading' },
    },
    'share.text': {
      label: 'Поделиться · текст',
      values: ['Поделиться проба Альфа', 'Поделиться проба Бета'],
      meaning: 'подпись кнопки «Поделиться» видима',
      check: { type: 'text-lands' },
    },
    padding: {
      label: 'Отступы',
      values: [{ top: 0, bottom: 0 }, { top: 80, bottom: 80 }],
      meaning: 'внутренние отступы секции сверху/снизу',
      check: { type: 'padding-delta' },
    },
    // ─── волна данных (вариант-товар @variantProduct: 3 фото, 2 группы, 4 комбо) ───
    productId: {
      label: 'Выбор товара',
      values: ['@altProduct', '@variantProduct'],
      meaning: 'блок рендерит ВЫБРАННЫЙ товар тенанта (имя/цена/галерея меняются)',
      check: { type: 'heading-differs' },
    },
    layout: {
      label: 'Макет',
      // полный набор stacked/two-columns/carousel/split; гейт-пара — гарантированно
      // различимая раскладка (1 кадр+тумбы ↔ плитка крупных). Прочие ветки — см. отчёт.
      values: ['carousel', 'two-columns'],
      meaning: 'раскладка ГАЛЕРЕИ фото: carousel = один кадр + тумбы, two-columns = плитка крупных',
      also: { productId: '@variantProduct' },
      check: { type: 'gallery-layout' },
    },
    'variants.displayStyle': {
      label: 'Вариации · стиль',
      values: ['button', 'list'],
      meaning: 'button = чипы-кнопки опций; list = выпадающие списки (select)',
      also: { productId: '@variantProduct' },
      check: { type: 'selector-visibility', mediaSelector: 'select', map: { button: false, list: true } },
    },
    'variants.shape': {
      label: 'Вариации · форма',
      values: ['none', 'circle', 'square'],
      meaning: 'none = текст-чипы; circle/square = свотчи цвета соотв. формы (swatchHex опций)',
      also: { productId: '@variantProduct', 'variants.displayStyle': 'button' },
      check: { type: 'swatch-shape', needle: 'Чёрный' },
    },
    'buttons.addToCart.text': {
      label: 'Основная кнопка',
      // НЕ тумблер: текст кнопки; ПУСТО = скрыть (Product.astro:123 addBtnTextRaw)
      values: ['В корзину проба', ''],
      meaning: 'текст «Добавить в корзину»; пустая строка скрывает кнопку',
      also: { productId: '@variantProduct' },
      check: { type: 'selector-visibility', mediaSelector: '[data-add-to-cart]', map: { 'В корзину проба': true, '': false } },
    },
  },
  uncovered: {
    zoomMode: 'клик/ховер-зум = интерактив (нужен реальный клик/ховер), вне волны 1 «только смена настроек»',
    dynamicButton: 'плавающая кнопка проявляется при скролле = интерактив, вне волны 1',
    colorScheme: 'схему вешает компоновщик страницы, а не блок — каналом update-block не меряется; page-tier волна',
  },
};
