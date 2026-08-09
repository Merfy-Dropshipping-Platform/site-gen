// Контракт секции «Изображение» (Hero). Смысл каждой настройки снят с
// эталона Rose: themes/rose/src/components/sections/Hero.astro (строки указаны).
// Список полей = фактические видимые поля puck-config (гард полноты раннера).
//
// `also` — сопутствующие пропы, применяемые вместе с пробным значением: сид
// Hero задаёт только backgroundImages, а проверкам позиции/кнопок нужен
// существующий контент (ровно как мерчант, который сначала вводит заголовок).

// data-URI: локальный гейт не должен зависеть от прод-MinIO/сети (2026-08-08
// прод-png перестал успевать грузиться — ложное красное). 1×1, растянется CSS.
const IMG_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const IMG_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export default {
  block: 'Hero',
  fields: {
    size: {
      label: 'Размер',
      values: ['small', 'medium', 'large'],
      meaning: 'высота полотна секции, НЕ шрифт (Hero.astro:68, лестница min-h :96-99)',
      check: { type: 'monotonic-height' },
    },
    overlay: {
      label: 'Затемнение',
      values: [0, 60],
      meaning: 'слой затемнения между фото и контентом, opacity = N/100 (Hero.astro:278-281)',
      check: { type: 'brightness-drop' },
    },
    position: {
      label: 'Позиция',
      values: ['top-left', 'bottom-right'],
      meaning: 'контент уезжает в указанную зону полотна, дефолт bottom-center (Hero.astro:125-135)',
      also: { 'heading.text': 'Проба позиции реестра' },
      check: { type: 'corner' },
    },
    alignment: {
      label: 'Выравнивание',
      values: ['left', 'right'],
      meaning: 'выравнивание текста контента внутри колонки (Hero.astro, alignCls)',
      also: { 'heading.text': 'Проба выравнивания' },
      check: { type: 'align-x' },
    },
    container: {
      label: 'Контейнер',
      values: ['false', 'true'],
      meaning: 'вкл = подложка-плашка под текстовым блоком: фон схемы + паддинги + радиус (Hero.astro:115-123)',
      also: { 'heading.text': 'Проба контейнера' },
      check: { type: 'content-plate' },
    },
    'heading.text': {
      label: 'Заголовок · текст',
      values: ['Проба реестра Альфа', 'Проба реестра Бета'],
      meaning: 'введённый заголовок видим в секции',
      check: { type: 'text-lands' },
    },
    'heading.size': {
      label: 'Заголовок · размер',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль заголовка растёт (Hero.astro:78-95, headingCls)',
      also: { 'heading.text': 'Проба кегля заголовка' },
      check: { type: 'monotonic-font', target: 'heading' },
    },
    'text.content': {
      label: 'Текст · содержимое',
      values: ['Проба подзаголовка Альфа', 'Проба подзаголовка Бета'],
      meaning: 'введённый подзаголовок видим в секции',
      check: { type: 'text-lands' },
    },
    'text.size': {
      label: 'Текст · размер',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль подзаголовка растёт',
      also: { 'text.content': 'Проба кегля подзаголовка' },
      check: { type: 'monotonic-font', target: 'needle', needlePath: 'text.content' },
    },
    'primaryButton.text': {
      label: 'Кнопка основная · текст',
      values: ['Кнопка проба Альфа', 'Кнопка проба Бета'],
      meaning: 'текст основной кнопки видим',
      check: { type: 'text-lands' },
    },
    'primaryButton.link': {
      label: 'Кнопка основная · ссылка',
      values: ['/catalog?registry-probe=1'],
      meaning: 'основная кнопка ведёт по введённому адресу',
      also: { 'primaryButton.text': 'Кнопка пробы реестра' },
      check: { type: 'href-lands', buttonTextPath: 'primaryButton.text' },
    },
    'secondaryButton.text': {
      label: 'Кнопка вторичная · текст',
      values: ['Вторая проба Альфа', 'Вторая проба Бета'],
      meaning: 'текст вторичной кнопки видим',
      check: { type: 'text-lands' },
    },
    'secondaryButton.link': {
      label: 'Кнопка вторичная · ссылка',
      values: ['/about?registry-probe=2'],
      meaning: 'вторичная кнопка ведёт по введённому адресу',
      also: { 'secondaryButton.text': 'Вторая кнопка пробы' },
      check: { type: 'href-lands', buttonTextPath: 'secondaryButton.text' },
    },
    'backgroundImages.url1': {
      label: 'Изображения · фото 1',
      values: [IMG_A, IMG_B],
      meaning: 'выбранное фото реально показывается и загружено',
      check: { type: 'image-swaps' },
    },
  },
  uncovered: {
    colorScheme: 'схему вешает компоновщик страницы, а не блок — каналом update-block не меряется; page-tier волна',
    'backgroundImages.url2': 'второе фото коллажа — вид-специфика раскладки rose grid-4; меряется той же image-swaps при расширении, пока вне волны 1',
  },
};
