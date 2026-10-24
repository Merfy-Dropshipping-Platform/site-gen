// Код, который не принимает старое состояние: с копией ctx.state mount бросает, без неё — запускается (часть 5г).
export default {
  mount(_el, ctx) {
    if (ctx.state.mounts !== undefined) throw new Error('старое состояние не подходит');
    ctx.state.mounts = 1;
    ctx.ref('clock')?.text('picky · запусков: 1 · ' + (ctx.state.coat || 'нет'));
  },
};
