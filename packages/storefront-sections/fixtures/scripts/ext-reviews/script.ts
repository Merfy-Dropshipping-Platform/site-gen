import { defineSection } from '@merfy/shell';

// Секция «Отзывы» на тестовом расширении «Отзывы-тест» (блок 9 «Секций и SDK», часть 9в): "uses": ["ext:test-ext"];
// стор расширения — через ctx.ext, метод «Полезно» — из разметки (data-action="ext.test-ext.vote").
export default defineSection({
  mount(_el, ctx) {
    ctx.watch(ctx.ext['test-ext'].$summary, (value) => {
      ctx.ref('summary')?.text(value === null ? '—' : JSON.stringify(value));
    });
  },
});
