// Секция, которая падает при запуске: её кнопки — aria-disabled, ссылка работает, соседние секции работают.
export default {
  mount() {
    throw new Error('сломалась при запуске');
  },
  actions: {
    pick() {},
  },
};
