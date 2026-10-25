import { defineSection, type Ctx, type El } from '@merfy/shell';
import { HIDE_AFTER_MS, type Notice, closedNotices, roleOf, shownNotices } from './notices.ts';

// «Уведомления» (блок 9 «Секций и SDK», «Решил сам» п. 10; часть 9б): слушает merfy:notice:show и показывает список
// внизу экрана. Строки рисуются заново из <template> списка, поэтому фокус после перерисовки сброшен; пока указатель над
// списком или фокус на «Закрыть», сроки стоят — отпустили, у каждого снова 8 с.

interface NoticesState {
  notices: readonly Notice[];
  timers: Map<string, () => void>;
  hover: boolean;
  focus: boolean;
}

// ctx.state — Partial: умолчания записываются при первом чтении, дальше объект полный.
const ready = (state: Partial<NoticesState>): state is NoticesState =>
  state.notices !== undefined && state.timers !== undefined && state.hover !== undefined && state.focus !== undefined;

const freshState = (): NoticesState => ({ notices: [], timers: new Map(), hover: false, focus: false });

const stateOf = (ctx: Ctx<NoticesState, never>): NoticesState => {
  if (!ready(ctx.state)) ctx.state = freshState();
  return ready(ctx.state) ? ctx.state : freshState();
};

const held = (state: NoticesState): boolean => state.hover || state.focus;

const clearTimer = (state: NoticesState, message: string): void => {
  state.timers.get(message)?.();
  state.timers.delete(message);
};

const clearAllTimers = (state: NoticesState): void => {
  for (const stop of state.timers.values()) stop();
  state.timers.clear();
};

const fillRow = (row: El, notice: Notice): void => {
  row.attr('role', roleOf(notice.level));
  row.attr('data-level', notice.level);
  row.ref('text')?.text(notice.message);
  row.ref('close')?.attr('data-message', notice.message);
};

const render = (ctx: Ctx<NoticesState, never>, state: NoticesState): void => {
  const list = ctx.ref('list');
  list?.toggle(state.notices.length > 0);
  list?.list(state.notices, fillRow);
};

const schedule = (ctx: Ctx<NoticesState, never>, state: NoticesState, message: string): void => {
  if (held(state)) return;
  clearTimer(state, message);
  state.timers.set(
    message,
    ctx.after(HIDE_AFTER_MS, () => {
      state.notices = closedNotices(state.notices, message);
      state.timers.delete(message);
      render(ctx, state);
    }),
  );
};

const scheduleAll = (ctx: Ctx<NoticesState, never>, state: NoticesState): void => {
  if (held(state)) return;
  for (const notice of state.notices) schedule(ctx, state, notice.message);
};

const show = (ctx: Ctx<NoticesState, never>, next: Notice): void => {
  const state = stateOf(ctx);
  const fresh = shownNotices(state.notices, next);
  for (const notice of state.notices) {
    if (!fresh.some((item) => item.message === notice.message)) clearTimer(state, notice.message);
  }
  state.notices = fresh;
  render(ctx, state);
  schedule(ctx, state, next.message);
};

const hold = (ctx: Ctx<NoticesState, never>, eventType: string): void => {
  const state = stateOf(ctx);
  if (eventType.startsWith('pointer')) state.hover = true;
  else state.focus = true;
  clearAllTimers(state);
};

const release = (ctx: Ctx<NoticesState, never>, eventType: string): void => {
  const state = stateOf(ctx);
  if (eventType.startsWith('pointer')) state.hover = false;
  else state.focus = false;
  scheduleAll(ctx, state);
};

export default defineSection<NoticesState, never>({
  mount(_el, ctx) {
    ctx.listen('merfy:notice:show', (detail) => {
      if (detail.message === '') return;
      show(ctx, { level: detail.level, message: detail.message });
    });
  },
  actions: {
    close(target, ctx) {
      const state = stateOf(ctx);
      const message = target.attr('data-message');
      if (message === null) return;
      state.notices = closedNotices(state.notices, message);
      clearTimer(state, message);
      render(ctx, state);
    },
    hold(_target, ctx, event) {
      hold(ctx, event.type);
    },
    release(_target, ctx, event) {
      release(ctx, event.type);
    },
  },
});
