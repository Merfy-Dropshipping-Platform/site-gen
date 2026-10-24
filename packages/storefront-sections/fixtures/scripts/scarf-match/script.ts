import { defineSection, type Ctx } from '@merfy/shell';

type State = { coat: string | null; mounts: number };

export default defineSection<State>({
  mount(_el, ctx) {
    ctx.state.mounts = (ctx.state.mounts ?? 0) + 1;
    show(ctx);
    const opened = Date.now();
    ctx.every(1000, () => {
      const seconds = Math.round((Date.now() - opened) / 1000);
      ctx.ref('clock')?.text(`Подбор открыт ${seconds} с · запусков: ${ctx.state.mounts}`);
    });
  },
  actions: {
    pick(button, ctx) {
      ctx.state.coat = button.attr('data-coat');
      show(ctx);
    },
  },
});

function show(ctx: Ctx<State>): void {
  const coat = ctx.state.coat ?? null;
  for (const button of ctx.refs('coat')) {
    const pressed = button.attr('data-coat') === coat;
    button.attr('aria-pressed', String(pressed));
    button.toggleClass('bg-primary', pressed);
    button.toggleClass('text-primary-foreground', pressed);
  }
  for (const scarf of ctx.refs('scarf')) {
    const goes = (scarf.attr('data-goes-with') ?? '').split(' ');
    scarf.toggle(coat === null || goes.includes(coat));
  }
}
