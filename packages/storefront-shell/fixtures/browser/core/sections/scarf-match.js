// «Подбор шарфа по цвету пальто» (design.md блока 5, раздел 1) — модуль секции после сохранения: без defineSection.
export default {
  actions: {
    pick(target, ctx) {
      ctx.refs('coat').forEach((coat) => coat.attr('aria-pressed', coat === target ? 'true' : 'false'));
      ctx.ref('hint')?.text(`${ctx.settings.title}: ${target.attr('data-coat')}`);
    },
  },
};
