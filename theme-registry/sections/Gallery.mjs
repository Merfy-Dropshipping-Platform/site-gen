// Контракт секции «Галерея» (Gallery). Смысл настроек снят с эталона Rose:
// themes/rose/src/components/sections/Gallery.astro (макс 3 элемента).
const IT = (n) => ({
  id: `item-${n}`,
  type: 'image',
  url: 'https://minio.merfy.ru/product-images/72b8fafa-5500-4547-b8c8-b1aeede1abe7.webp',
  alt: 'Изображение',
});

export default {
  block: 'Gallery',
  fields: {
    items: {
      label: 'Элементы (макс 3)',
      values: [
        [IT(1), IT(2)],
        [IT(1), IT(2), IT(3)],
      ],
      meaning: 'добавленный элемент = плитка галереи (items[] ≤3)',
      check: { type: 'image-count-length' },
    },
    heading: {
      label: 'Заголовок',
      values: ['Галерея проба Альфа', 'Галерея проба Бета'],
      meaning: 'введённый заголовок видим',
      check: { type: 'text-lands' },
    },
    headingSize: {
      label: 'Размер заголовка',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль заголовка растёт (--gallery-heading-size clamp, Gallery.astro:21-29; читает #gallery-title)',
      also: { heading: 'Проба кегля галереи' },
      check: { type: 'monotonic-font', target: 'heading' },
    },
    text: {
      label: 'Текст',
      values: ['Текст галереи Альфа', 'Текст галереи Бета'],
      meaning: 'введённый текст видим',
      check: { type: 'text-lands' },
    },
    textSize: {
      label: 'Размер текста',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль текста растёт (14/16/19, Gallery.astro:31-37)',
      also: { text: 'Проба кегля текста галереи' },
      check: { type: 'monotonic-font', target: 'needle', needlePath: 'text' },
    },
    imagePosition: {
      label: 'Положение изображения',
      values: ['left', 'right'],
      meaning: 'крупное изображение галереи слева ↔ справа',
      check: { type: 'media-side' },
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
