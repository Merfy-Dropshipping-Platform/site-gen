// Контракт блока «Корзина · содержимое» (CartBody, split-корзина spec 110).
// Волна 1: панель блока = только схема и отступы (тексты корзины — Theme
// Settings, вне блочной панели; наполнение/степперы = интерактив-волна).
export default {
  block: 'CartBody',
  fields: {
    padding: {
      label: 'Отступы',
      values: [{ top: 0, bottom: 0 }, { top: 80, bottom: 80 }],
      meaning: 'внутренние отступы блока содержимого корзины',
      check: { type: 'padding-delta' },
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
