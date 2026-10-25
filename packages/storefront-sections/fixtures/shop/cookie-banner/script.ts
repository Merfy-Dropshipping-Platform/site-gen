import { defineSection } from '@merfy/shell';

// Баннер cookie (блок 13 «Секций и SDK», часть 13б): виден, пока покупатель не ответил; кнопки — действия разметки
// consent.accept и consent.decline части consent ядра. Ответ один на все страницы магазина.
export default defineSection({
  mount(_element, ctx) {
    ctx.watch(ctx.consent.$consent, (answer) => ctx.ref('banner')?.toggle(answer === 'unknown'));
  },
});
