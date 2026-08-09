// Контракт секции «Изображение с текстом» (ImageWithText; у flux порт = Puk).
// Смысл настроек снят с эталона Rose: themes/rose/src/components/sections/ImageWithText.astro.
// data-URI: локальный гейт не должен зависеть от прод-MinIO/сети (2026-08-08
// прод-png перестал успевать грузиться — ложное красное). 1×1, растянется CSS.
const IMG_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const IMG_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export default {
  block: 'ImageWithText',
  fields: {
    'image.url': {
      label: 'Изображения',
      values: [IMG_A, IMG_B],
      meaning: 'выбранное фото реально показывается и загружено',
      check: { type: 'image-swaps' },
    },
    size: {
      label: 'Размер',
      values: ['small', 'medium', 'large'],
      meaning: 'пропорция изображения: small 429/309 (шире) → medium 429/444 → large 430/500 (вытянутее) (IWT.astro:71-75)',
      also: { 'image.url': IMG_A },
      check: { type: 'media-aspect-order' },
    },
    width: {
      label: 'Ширина',
      values: ['small', 'medium', 'large'],
      meaning: 'ширина контентного контейнера: 780 → 1080 → 1320 (IWT.astro:80-86)',
      check: { type: 'width-monotonic' },
    },
    imagePosition: {
      label: 'Позиция фото',
      values: ['left', 'right'],
      meaning: 'фото слева ↔ справа от текста',
      also: { 'image.url': IMG_A },
      check: { type: 'media-side' },
    },
    alignment: {
      label: 'Выравнивание',
      values: ['left', 'right'],
      meaning: 'выравнивание заголовка/текста/кнопки в текстовой колонке (IWT.astro:34-40)',
      also: { 'heading.text': 'Проба выравнивания ИсТ' },
      check: { type: 'align-x' },
    },
    'heading.text': {
      label: 'Заголовок · текст',
      values: ['ИсТ проба Альфа', 'ИсТ проба Бета'],
      meaning: 'введённый заголовок видим',
      check: { type: 'text-lands' },
    },
    'heading.size': {
      label: 'Заголовок · размер',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль заголовка растёт (17/20/24 через --size-section-heading, IWT.astro:24-30)',
      also: { 'heading.text': 'Проба кегля ИсТ' },
      check: { type: 'monotonic-font', target: 'heading' },
    },
    'text.content': {
      label: 'Текст · содержимое',
      values: ['Текст ИсТ проба Альфа', 'Текст ИсТ проба Бета'],
      meaning: 'введённый текст видим',
      check: { type: 'text-lands' },
    },
    'text.size': {
      label: 'Текст · размер',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль текста растёт',
      also: { 'text.content': 'Проба кегля текста ИсТ' },
      check: { type: 'monotonic-font', target: 'needle', needlePath: 'text.content' },
    },
    'button.text': {
      label: 'Кнопка · текст',
      values: ['Кнопка ИсТ Альфа', 'Кнопка ИсТ Бета'],
      meaning: 'текст кнопки видим',
      check: { type: 'text-lands' },
    },
    'button.link': {
      label: 'Кнопка · ссылка',
      values: ['/catalog?iwt-probe=1'],
      meaning: 'кнопка ведёт по введённому адресу',
      also: { 'button.text': 'Кнопка пробы ИсТ' },
      check: { type: 'href-lands', buttonTextPath: 'button.text' },
    },
    padding: {
      label: 'Отступы',
      values: [{ top: 0, bottom: 0 }, { top: 80, bottom: 80 }],
      meaning: 'внутренние отступы секции',
      check: { type: 'padding-delta' },
    },
  },
  uncovered: {
    colorScheme: 'схему вешает компоновщик страницы — page-tier волна',
  },
};
