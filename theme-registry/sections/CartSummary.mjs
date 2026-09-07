// Контракт блока «Корзина · сводка» (CartSummary, split-корзина spec 110).
// Волна 1: панель блока = только схема и отступы (тексты корзины — Theme
// Settings, вне блочной панели; наполнение/степперы = интерактив-волна).
export default {
  block: 'CartSummary',
  fields: {
    padding: {
      label: 'Отступы',
      values: [{ top: 0, bottom: 0 }, { top: 80, bottom: 80 }],
      meaning: 'внутренние отступы блока сводки (блок display:none при пустой корзине — мерим computed padding)',
      check: { type: 'padding-computed' },
    },
    colorScheme: {
      label: 'Цветовая схема',
      values: ['scheme-1', 'scheme-2', 'scheme-4'],
      meaning: 'схема блока (меряем сам блок: фон/цвет корня или контейнера)',
      check: { type: 'scheme-change' },
    },
  },
  uncovered: {},
};
