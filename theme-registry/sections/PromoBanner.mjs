// Контракт секции «Объявление» (PromoBanner). Смысл настроек снят с эталона
// Rose: themes/rose/src/components/sections/PromoBanner.astro.
export default {
  block: 'PromoBanner',
  fields: {
    text: {
      label: 'Текст',
      values: ['Объявление проба Альфа', 'Объявление проба Бета'],
      meaning: 'введённый текст объявления видим (PromoBanner.astro:9-11)',
      check: { type: 'text-lands' },
    },
    'link.text': {
      label: 'Ссылка · текст',
      values: ['Ссылка проба Альфа', 'Ссылка проба Бета'],
      meaning: 'подпись ссылки видима (PromoBanner.astro:14)',
      check: { type: 'text-lands' },
    },
    'link.href': {
      label: 'Ссылка · адрес',
      values: ['/catalog?promo-probe=1'],
      meaning: 'ссылка ведёт по введённому адресу (PromoBanner.astro:13)',
      also: { 'link.text': 'Ссылка пробы объявления' },
      check: { type: 'href-lands', buttonTextPath: 'link.text' },
    },
    size: {
      label: 'Размер',
      values: ['thin', 'small', 'medium', 'large'],
      meaning: 'высота полосы растёт: thin 24 / small 32 / medium 40 / large 48 (SIZE_MAP; thin — additive 084)',
      check: { type: 'monotonic-height' },
    },
  },
  uncovered: {
    padding:
      'rose СОЗНАТЕЛЬНО не применяет (Figma 648:57318 убрала отступы у полосы — высоту задаёт только «Размер», PromoBanner.astro:28); поле в общей панели — кандидат на скрытие',
    colorScheme: 'схему вешает компоновщик страницы — page-tier волна',
  },
};
