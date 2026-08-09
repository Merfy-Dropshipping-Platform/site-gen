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
  },
  uncovered: {
    layout:
      'раскладка ГАЛЕРЕИ фото (split/carousel/two-columns/stacked — Product.astro:64-67): различима только у товара с несколькими фото; у демо один плейсхолдер — волна данных',
    productId: 'выбор товара = данные тенанта (у rose-гейта товаров нет); подстановка карточки — гидрация, вне волны 1',
    zoomMode: 'клик/ховер-зум = интерактив (нужен реальный клик/ховер), вне волны 1 «только смена настроек»',
    dynamicButton: 'плавающая кнопка проявляется при скролле = интерактив, вне волны 1',
    'variants.displayStyle': 'нужен товар с вариациями — у rose-гейта товаров нет; интерактив-волна/волна данных',
    'variants.shape': 'нужен товар с вариациями — у rose-гейта товаров нет; интерактив-волна/волна данных',
    'buttons.addToCart': 'тумблер кнопки корзины завязан на наличие товара (демо-ветка может не рендерить кнопку); волна данных',
    colorScheme: 'схему вешает компоновщик страницы, а не блок — каналом update-block не меряется; page-tier волна',
  },
};
