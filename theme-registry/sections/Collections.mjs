// Контракт секции «Коллекции» (Collections). Смысл настроек снят с эталона
// Rose: themes/rose/src/components/sections/Collections.astro (строки указаны).
// Плейсхолдер-плитки рендерятся и без данных тенанта (Collections.astro:287) —
// гейт на пустом rose-тенанте валиден.
export default {
  block: 'Collections',
  fields: {
    heading: {
      label: 'Заголовок',
      values: ['Коллекции проба Альфа', 'Коллекции проба Бета'],
      meaning: 'введённый заголовок секции видим',
      check: { type: 'text-lands' },
    },
    headingSize: {
      label: 'Размер заголовка',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль заголовка растёт (Collections.astro:24-29, headingSizeCls)',
      also: { heading: 'Проба кегля коллекций' },
      check: { type: 'monotonic-font', target: 'heading' },
    },
    subtitle: {
      label: 'Текст',
      values: ['Подзаголовок проба Альфа', 'Подзаголовок проба Бета'],
      meaning: 'введённый подзаголовок видим',
      check: { type: 'text-lands' },
    },
    subtitleSize: {
      label: 'Размер текста',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль подзаголовка растёт (Collections.astro:34-40, subtitleSizeCls)',
      also: { subtitle: 'Проба кегля подзаголовка коллекций' },
      check: { type: 'monotonic-font', target: 'needle', needlePath: 'subtitle' },
    },
    columns: {
      label: 'Колонки',
      values: [2, 4],
      meaning: 'число колонок сетки: --cols на md+ (Collections.astro:52,72-75), плитки сужаются пропорционально',
      check: { type: 'tile-density' },
    },
    padding: {
      label: 'Отступы',
      values: [{ top: 0, bottom: 0 }, { top: 80, bottom: 80 }],
      meaning: 'внутренние отступы секции сверху/снизу',
      check: { type: 'padding-delta' },
    },
  },
  uncovered: {
    collections:
      'выбор НАБОРА коллекций = данные тенанта (у rose-сайта гейта коллекций нет); механизм сетки покрыт columns, подстановка реальных карточек — гидрация, вне волны 1',
    colorScheme: 'схему вешает компоновщик страницы, а не блок — каналом update-block не меряется; page-tier волна',
  },
};
