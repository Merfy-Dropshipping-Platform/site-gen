import { defineSection } from '@merfy/shell';

// Подбор цвета, версия 3: падает при запуске — превью отвечает failed, секция «не ожила», соседи живые.
export default defineSection({
  mount() {
    throw new Error('v3 сломалась при запуске');
  },
});
