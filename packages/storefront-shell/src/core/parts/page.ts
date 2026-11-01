import { pageInfoOf } from '../page-info';
import { requestJson } from '../requests';
import { atom, onMount, readable, type Atom } from '../stores';
import type { CoreHandle, PageModule, SdkPart } from '../types';

// Модуль page (ctx.page с uses: ["page"]): сторы страницы целиком. Скрипту секции window и document недоступны, а
// ctx.on('window', 'scroll') отдаёт событие без положения прокрутки — поэтому положение прокрутки, уход посетителя и
// время сервера читает ядро. Секция с uses: ["page"] получает этот объект вместо ctx.page: path и query остаются на месте.
// Слушатели $leaving — на всю жизнь страницы; $scroll и $now работают, только пока на них кто-то подписан.

export const NOW_TICK_MS = 1000;

// Телефон и планшет без курсора: «уход» — резкий рывок вверх к верху страницы, туда, где адресная строка и вкладки
// браузера. Рывок — подъём не меньше TOUCH_RISE_PX за TOUCH_WINDOW_MS (2 px/мс); чтение вверх идёт в разы медленнее
// (около 0,3–0,8 px/мс), быстрый свайп — 2–6 px/мс. «У верха» — прокрутка остановилась не ниже TOUCH_TOP_PX: рывок,
// остановленный на середине страницы, ничего не значит.
export const TOUCH_TOP_PX = 150;
export const TOUCH_RISE_PX = 600;
export const TOUCH_WINDOW_MS = 300;

// Доля прокрутки, целое 0–100: насколько окно прошло от верха страницы к её низу. Страница короче окна — 0.
function scrolledOf(win: Window): number {
  const root = win.document.documentElement;
  const rest = root.scrollHeight - root.clientHeight;
  if (rest <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((win.scrollY / rest) * 100)));
}

// Слушатели прокрутки — пассивные и только пока есть подписчик; значение обновляется не чаще кадра. Размер окна
// меняет долю так же, как прокрутка.
function scrollStore(win: Window): Atom<number> {
  const state = atom<number>(scrolledOf(win));
  onMount(state, () => {
    const listeners = new AbortController();
    let frame = 0;
    const read = (): void => {
      frame = 0;
      state.set(scrolledOf(win));
    };
    const queue = (): void => {
      if (frame === 0) frame = win.requestAnimationFrame(read);
    };
    state.set(scrolledOf(win));
    win.addEventListener('scroll', queue, { passive: true, signal: listeners.signal });
    win.addEventListener('resize', queue, { passive: true, signal: listeners.signal });
    return () => {
      listeners.abort();
      if (frame !== 0) win.cancelAnimationFrame(frame);
    };
  });
  return state;
}

// Устройство без курсора: основной указатель не умеет наводиться (телефон, планшет). jsdom без matchMedia — с курсором.
function hasNoCursor(win: Window): boolean {
  const matchMedia = win.matchMedia?.bind(win);
  return matchMedia !== undefined && matchMedia('(hover: none)').matches;
}

interface Sample {
  readonly y: number;
  readonly at: number;
}

// Рывок вверх: положение прокрутки за последние TOUCH_WINDOW_MS; подъём и остановка у верха — уход.
function watchRise(win: Window, raise: () => void): void {
  let samples: readonly Sample[] = [];
  win.addEventListener(
    'scroll',
    () => {
      const at = win.performance.now();
      const y = win.scrollY;
      samples = [...samples.filter((sample) => at - sample.at <= TOUCH_WINDOW_MS), { y, at }];
      const highest = Math.max(...samples.map((sample) => sample.y));
      if (y > TOUCH_TOP_PX || highest - y < TOUCH_RISE_PX) return;
      samples = [];
      raise();
    },
    { passive: true },
  );
}

// $leaving и событие merfy:page:leaving: компьютер — курсор вышел за верхний край окна, к вкладкам и адресной строке;
// без курсора — рывок вверх. Событие — один раз на уход; стор остаётся true, пока курсор не вернулся в окно или
// посетитель не коснулся экрана.
function leavingStore(core: CoreHandle, win: Window): Atom<boolean> {
  const state = atom<boolean>(false);
  const raise = (): void => {
    if (state.get()) return;
    state.set(true);
    core.emit('merfy:page:leaving', {});
  };
  const calm = (): void => state.set(false);
  const root = win.document.documentElement;
  root.addEventListener('mouseleave', (event) => {
    if (event.clientY <= 0) raise();
  });
  root.addEventListener('mouseenter', calm);
  win.addEventListener('pointerdown', calm, { passive: true });
  if (hasNoCursor(win)) watchRise(win, raise);
  return state;
}

const serverTimeOf = (body: unknown): number | null => {
  const now: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'now') : undefined;
  return typeof now === 'number' && Number.isFinite(now) ? now : null;
};

// Смещение часов устройства от сервера, мс: ответ шлюза /store/time. Сервер назвал время где-то посередине пути туда и
// обратно, поэтому к его времени прибавляется половина пути. Нет ответа или он не по форме — 0: таймер идёт по часам
// устройства, а не ждёт сервер, которого нет.
async function offsetOf(apiUrl: string): Promise<number> {
  const sent = Date.now();
  const reply = await requestJson(`${apiUrl}/store/time`, { method: 'GET' });
  const received = Date.now();
  const server = reply.status === 200 ? serverTimeOf(reply.body) : null;
  return server === null ? 0 : server + (received - sent) / 2 - received;
}

// $now: пока смещение неизвестно — null. Превью и страница без конфига — часы устройства сразу. Запрос времени — один
// на страницу, при первой подписке; секундный таймер — пока есть подписчики.
function nowStore(core: CoreHandle, win: Window): Atom<number | null> {
  const config = core.mode === 'preview' ? null : core.config;
  const clock: { offset: number | null } = { offset: config === null ? 0 : null };
  const state = atom<number | null>(clock.offset === null ? null : Date.now());
  const tick = (): void => {
    if (clock.offset !== null) state.set(Math.round(Date.now() + clock.offset));
  };
  let asked = false;
  onMount(state, () => {
    tick();
    if (config !== null && !asked) {
      asked = true;
      void offsetOf(config.api.url).then((offset) => {
        clock.offset = offset;
        tick();
      });
    }
    const timer = win.setInterval(tick, NOW_TICK_MS);
    return () => win.clearInterval(timer);
  });
  return state;
}

export const page: SdkPart<'page', PageModule> = {
  name: 'page',
  create: (core: CoreHandle): PageModule => ({
    ...pageInfoOf(window),
    $scroll: readable(scrollStore(window)),
    $leaving: readable(leavingStore(core, window)),
    $now: readable(nowStore(core, window)),
  }),
};
