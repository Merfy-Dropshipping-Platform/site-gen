// Контракт секции «Подвал» (Footer). Смысл настроек снят с эталона Rose:
// themes/rose/src/components/Footer.astro (панель dynamic — b71bd733).
// Колонки/копирайт скрыты из панели (инжект данных из БД — injectFooterData).
export default {
  block: 'Footer',
  fields: {
    'newsletter.enabled': {
      label: 'Рассылка',
      values: ['true', 'false'],
      meaning: 'тумблер блока рассылки: форма e-mail появляется/уходит',
      check: { type: 'selector-visibility', mediaSelector: 'input[type="email"]', map: { true: true, false: false } },
    },
    'heading.text': {
      label: 'Заголовок · текст',
      values: ['Подвал проба Альфа', 'Подвал проба Бета'],
      meaning: 'заголовок блока рассылки из панели (b71bd733 — поля живые, не хардкод)',
      also: { 'newsletter.enabled': 'true' },
      check: { type: 'text-lands' },
    },
    'heading.size': {
      label: 'Заголовок · размер',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль заголовка рассылки растёт (roseFooterHeadingStyle → --size-section-heading)',
      also: { 'newsletter.enabled': 'true', 'heading.text': 'Проба кегля подвала' },
      check: { type: 'monotonic-font', target: 'needle', needlePath: 'heading.text' },
    },
    'text.content': {
      label: 'Текст · содержимое',
      values: ['Текст подвала Альфа', 'Текст подвала Бета'],
      meaning: 'текст блока рассылки из панели',
      also: { 'newsletter.enabled': 'true' },
      check: { type: 'text-lands' },
    },
    'text.size': {
      label: 'Текст · размер',
      values: ['small', 'medium', 'large'],
      meaning: 'кегль текста рассылки растёт',
      also: { 'newsletter.enabled': 'true', 'text.content': 'Проба кегля текста подвала' },
      check: { type: 'monotonic-font', target: 'needle', needlePath: 'text.content' },
    },
    colorScheme: {
      label: 'Цветовая схема',
      values: ['scheme-1', 'scheme-2', 'scheme-4'], // ≥2 уникальных вида из тройки
      meaning: 'схема на <footer> (54ccd4b1 — рендер сам вешает класс, меряем через re-render канала)',
      check: { type: 'scheme-change' }, // корень блока = сам <footer>
    },
    padding: {
      label: 'Отступы',
      values: [{ top: 0, bottom: 0 }, { top: 80, bottom: 80 }],
      meaning: 'внутренние отступы подвала',
      check: { type: 'padding-delta' },
    },
  },
  uncovered: {
    'heading.alignment':
      'рендер эталона НЕ читает сабполе (выравнивание живёт в скрытом top-level contentAlign, Footer.astro:70) — мёртвый сабфилд панели; кандидат: замапить или скрыть. Доложено.',
  },
};
