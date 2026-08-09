// Контракт секции «Коллекция товаров» (PopularProducts). Смысл настроек снят
// с эталона Rose: themes/rose/src/components/sections/Popular.astro.
// Плейсхолдер-карточки честно считаются из cards (Popular.astro:40), но
// СОЗНАТЕЛЬНО без кнопок/реальных фото («Без data-product-id / data-add-to-cart»,
// Popular.astro:290) — карточные настройки меряются только с товарами → волна данных.
export default {
  block: 'PopularProducts',
  fields: {
    cards: {
      label: 'Карточки',
      values: [4, 8],
      meaning: 'число карточек в сетке (Popular.astro:40 — placeholderCards из cardsN; реальные — срез коллекции)',
      check: { type: 'grid-count' },
    },
    heading: {
      label: 'Заголовок',
      values: ['Товары проба Альфа', 'Товары проба Бета'],
      meaning: 'введённый заголовок секции видим',
      check: { type: 'text-lands' },
    },
    headingSize: {
      label: 'Размер заголовка',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль заголовка растёт ([&_h2]-утилиты, Popular.astro:50-55; top-level приоритетнее legacy — cc64b373)',
      also: { heading: 'Проба кегля товаров' },
      check: { type: 'monotonic-font', target: 'heading' },
    },
    text: {
      label: 'Текст',
      values: ['Описание товаров Альфа', 'Описание товаров Бета'],
      meaning: 'введённый подзаголовок видим',
      check: { type: 'text-lands' },
    },
    textSize: {
      label: 'Размер текста',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль подзаголовка растёт',
      also: { text: 'Проба кегля описания товаров' },
      check: { type: 'monotonic-font', target: 'needle', needlePath: 'text' },
    },
    columns: {
      label: 'Колонки',
      values: [2, 4],
      meaning: 'число колонок сетки (--cols, Popular.astro:68) — плитки сужаются пропорционально',
      also: { cards: 8 },
      check: { type: 'tile-density' },
    },
    padding: {
      label: 'Отступы',
      values: [{ top: 0, bottom: 0 }, { top: 80, bottom: 80 }],
      meaning: 'внутренние отступы секции',
      check: { type: 'padding-delta' },
    },
  },
  uncovered: {
    collection: 'выбор коллекции = данные тенанта (у rose-гейта нет коллекций); волна данных',
    buttonStyle: 'стиль кнопки живёт на РЕАЛЬНЫХ карточках — плейсхолдеры сознательно без кнопок; волна данных',
    imageView: 'аспект применяется селектором li>article>a (реальные карточки); плейсхолдер — article>div с фикс-аспектом 318/444; волна данных',
    nextPhotoOnHover: 'второе фото при наведении = интерактив + нужен товар с ≥2 фото; волна данных/интерактива',
    quickAddMode: 'кнопка быстрого добавления только на реальных карточках; волна данных',
    colorScheme: 'схему вешает компоновщик страницы — page-tier волна',
  },
};
