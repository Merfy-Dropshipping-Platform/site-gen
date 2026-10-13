import { defineSection, part } from '@merfy/shell';
import { createAnalytics } from './analytics.ts';

// Глобальный скрипт платформы platform:analytics (design.md блока 11; блок 7, С7-21 А): одна копия на страницу, ядро
// ставит ему скрытый <merfy-section> и зовёт mount на каждой странице. Отправка — sendBeacon с text/plain: простой
// запрос без проверки CORS, доходит и при уходе со страницы (решил сам 5).
const analytics = createAnalytics({
  win: window,
  beacon: (url, body) => navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' })),
  cart: () => part('cart'),
  newId: () => crypto.randomUUID(),
});

export default defineSection({
  mount: () => analytics.page(),
  unmount: () => analytics.flush(),
});
