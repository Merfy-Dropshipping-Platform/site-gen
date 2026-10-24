import { defineSection } from '@merfy/shell';

type State = { coat: string | null };

// Кнопка пальто — действие pick: отмечает кнопку и оставляет шарфы, у которых в подписи этот цвет пальто.
export default defineSection<State>({
  actions: {
    pick(button, ctx) {
      const coat = button.attr('data-coat');
      ctx.state.coat = coat;
      for (const item of ctx.refs('coat')) item.attr('aria-pressed', String(item.attr('data-coat') === coat));
      for (const scarf of ctx.refs('scarf')) scarf.toggle(coat === null || (scarf.attr('data-coats') ?? '').includes(coat));
    },
  },
});
