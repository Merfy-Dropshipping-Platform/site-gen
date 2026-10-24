import { defineSection } from '@merfy/shell';

// Город покупателя (глобальный скрипт расширения geo): до блока 13 только отметка в консоли превью.
export default defineSection({
  mount(_el, ctx) {
    ctx.log('город покупателя');
  },
});
