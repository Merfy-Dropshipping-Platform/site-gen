import { defineSection } from '@merfy/shell';

// Подбор шарфа по цвету пальто (своя секция магазина): совет — в элементе data-ref="advice".
export default defineSection({
  actions: {
    pick(button, ctx) {
      const coat = button.attr('data-coat') ?? '';
      ctx.ref('advice')?.text(`К пальто «${coat}» — шарф кэмел`);
    },
  },
});
