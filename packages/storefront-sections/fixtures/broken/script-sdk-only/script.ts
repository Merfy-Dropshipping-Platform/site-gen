import { defineSection } from '@merfy/shell';

// Сломанная секция (блок 5 «Секций и SDK», часть 5в): обходы «только SDK» из таблицы раздела 3.9 — каждый с местом.
export default defineSection({
  mount(_el, ctx) {
    document.title = 'Салют';
    const make = ({}).constructor.constructor;
    ctx.state.keys = Reflect.ownKeys(ctx);
    setTimeout(() => make('return 1')(), 10);
  },
});
