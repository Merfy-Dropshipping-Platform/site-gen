// Таймер секции: событие shop:ticker:tick раз в 100 мс; после удаления секции — ни одного.
export default {
  mount(_el, ctx) {
    ctx.every(100, () => ctx.emit('tick'));
  },
};
