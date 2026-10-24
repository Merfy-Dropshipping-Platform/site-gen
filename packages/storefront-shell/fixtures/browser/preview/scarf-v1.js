// «Подбор шарфа», версия 1 — модуль секции после сохранения: без импортов и без defineSection (часть 5г, тест превью).
function show(ctx) {
  ctx.ref('clock')?.text('v1 · запусков: ' + ctx.state.mounts + ' · ' + (ctx.state.coat || 'нет'));
}

export default {
  mount(_el, ctx) {
    ctx.state.mounts = (ctx.state.mounts || 0) + 1;
    show(ctx);
  },
  actions: {
    pick(target, ctx) {
      ctx.state.coat = target.attr('data-coat');
      show(ctx);
    },
  },
};
