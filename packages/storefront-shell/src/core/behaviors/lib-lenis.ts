import Lenis from 'lenis';
import { lockScroll, unlockScroll } from '../scroll-lock';
import type { El, LenisLib, LenisState } from '../types';
import type { LibAdapter, MotionHost } from './types';

// Адаптер плавной прокрутки Lenis — ctx.lib.lenis (13.11, пункт 7 спеки анимаций; каталог — libraries.ts). Решение
// владельца 13.11: прокрутка — библиотекой секции, а не настройкой темы; автор сам включает её и вешает свои анимации.
// Экземпляр один на страницу: его заводит первая секция с "lib:lenis", снимает уход последней. Lenis двигает настоящую
// прокрутку окна, поэтому ctx.scroll, ctx.inView и ctx.lib.motion работают с ним как есть.
// «Уменьшить движение» и запуск в превью после правки настроек или текста (still) — Lenis не заводится: прокрутка
// нативная, подписка — по событию scroll окна, scrollTo — сразу. Рекомендованные стили Lenis (lenis.css) ставит этот код
// в style у <html> и <body>, своего CSS у секции нет: scroll-behavior: auto — иначе scroll-behavior: smooth темы спорит с
// Lenis на якорях, height: auto — иначе height: 100% темы делает прокручиваемым <body>. Прежние значения вернутся.
// Окна поверх страницы запирают прокрутку (scroll-lock.ts, overflow: hidden у <html>): тогда колесо идёт мимо Lenis —
// прокручивается окно, а не страница под ним; вложенные области с прокруткой Lenis пропускает (allowNestedScroll).

type Listener = (state: LenisState) => void;

interface Shared {
  readonly lenis: Lenis | null; // null — нативная прокрутка
  readonly listeners: Set<Listener>;
  readonly stops: Set<MotionHost>; // секции, которые остановили прокрутку
  readonly destroy: () => void;
  users: number;
  configured: boolean;
}

let shared: Shared | null = null;

const fail = (text: string): never => {
  throw Object.assign(new Error(`ctx.lib.lenis.${text}`), { code: 'sdk-call-invalid' });
};
const numberIn = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : undefined;
const root = (): HTMLElement => document.documentElement;
const DIRECTIONS = [-1, 0, 1] as const;

function stateOf(lenis: Lenis | null, last: number): LenisState {
  const scroll = lenis?.scroll ?? window.scrollY;
  const limit = lenis?.limit ?? Math.max(root().scrollHeight - window.innerHeight, 0);
  const velocity = lenis?.velocity ?? scroll - last;
  return Object.freeze({
    scroll,
    limit,
    progress: limit > 0 ? Math.min(Math.max(scroll / limit, 0), 1) : 0,
    velocity,
    direction: DIRECTIONS[Math.sign(lenis?.direction ?? velocity) + 1] ?? 0,
  });
}

// Стили lenis.css — в style, с возвратом прежних.
function inlineStyles(): () => void {
  const html = root().style;
  const body = document.body.style;
  const saved = [html.scrollBehavior, html.height, body.height] as const;
  html.scrollBehavior = 'auto';
  html.height = 'auto';
  body.height = 'auto';
  return () => {
    [html.scrollBehavior, html.height, body.height] = saved;
  };
}

function create(still: boolean): Shared {
  const listeners = new Set<Listener>();
  const base = { listeners, stops: new Set<MotionHost>(), users: 0, configured: false };
  let last = window.scrollY;
  const emitOf = (lenis: Lenis | null) => (): void => {
    const state = stateOf(lenis, last);
    last = state.scroll;
    listeners.forEach((fn) => fn(state));
  };
  if (still) {
    const emit = emitOf(null);
    addEventListener('scroll', emit, { passive: true });
    return { ...base, lenis: null, destroy: () => removeEventListener('scroll', emit) };
  }
  const restore = inlineStyles();
  const lenis = new Lenis({
    autoRaf: true,
    allowNestedScroll: true,
    virtualScroll: () => root().style.overflow !== 'hidden',
  });
  lenis.on('scroll', emitOf(lenis));
  const destroy = (): void => {
    lenis.destroy();
    restore();
  };
  return { ...base, lenis, destroy };
}

// Запрет прокрутки — пока его держит хоть одна секция: overflow у <html> общим счётчиком с окнами (scroll-lock.ts) и
// stop у Lenis.
function setStopped(page: Shared, host: MotionHost, stopped: boolean): void {
  if (stopped && host.signal.aborted) return; // снятая секция запрет не ставит: снять его было бы некому
  const before = page.stops.size > 0;
  if (stopped) page.stops.add(host);
  else page.stops.delete(host);
  const after = page.stops.size > 0;
  if (before === after) return;
  if (after) {
    lockScroll(document);
    page.lenis?.stop();
  } else {
    unlockScroll(document);
    page.lenis?.start();
  }
}

function release(page: Shared, host: MotionHost): void {
  setStopped(page, host, false);
  page.users -= 1;
  if (page.users > 0) return;
  page.destroy();
  if (shared === page) shared = null;
}

// Цель: число px или узел своей секции (чужие узлы и селекторы — нет, как везде в песочнице).
function targetOf(host: MotionHost, target: number | El): number | Element {
  if (typeof target === 'number') return Number.isFinite(target) ? target : fail('scrollTo: число px или элемент');
  return host.scope.nodeOf(target) ?? fail('scrollTo: элемент не из этой секции');
}

function scrollToOf(page: Shared, host: MotionHost): LenisLib['scrollTo'] {
  return (target, options) => {
    const to = targetOf(host, target);
    const offset = numberIn(options?.offset, -1e6, 1e6) ?? 0;
    if (host.signal.aborted) return;
    if (page.lenis === null) {
      const top = typeof to === 'number' ? to : to.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + offset, behavior: 'instant' });
      return;
    }
    const duration = numberIn(options?.duration, 0, 10000);
    page.lenis.scrollTo(to, {
      offset,
      immediate: options?.immediate === true || host.still(),
      force: true,
      ...(duration === undefined ? {} : { duration: duration / 1000 }),
    });
  };
}

// Подписка: fn — под предохранителем секции; снятие секции — отписка.
function onScrollOf(page: Shared, host: MotionHost): LenisLib['onScroll'] {
  return (fn) => {
    if (typeof fn !== 'function') fail('onScroll: нужна функция');
    const listener: Listener = (state) => void host.run('runtime', () => fn(state));
    const stop = (): void => void page.listeners.delete(listener);
    if (host.signal.aborted) return stop;
    page.listeners.add(listener);
    host.signal.addEventListener('abort', stop, { once: true });
    return stop;
  };
}

function configureOf(page: Shared): LenisLib['configure'] {
  return (settings) => {
    if (page.configured) return false;
    page.configured = true;
    const lerp = numberIn(settings?.lerp, 0.01, 1);
    const duration = numberIn(settings?.duration, 100, 5000);
    if (page.lenis !== null && lerp !== undefined) page.lenis.options.lerp = lerp;
    if (page.lenis !== null && duration !== undefined) page.lenis.options.duration = duration / 1000;
    return true;
  };
}

export const lenis: LibAdapter<'lenis'> = (host) => {
  const page = (shared ??= create(host.still()));
  page.users += 1;
  host.signal.addEventListener('abort', () => release(page, host), { once: true });
  const api: LenisLib = {
    onScroll: onScrollOf(page, host),
    scrollTo: scrollToOf(page, host),
    stop: () => setStopped(page, host, true),
    start: () => setStopped(page, host, false),
    configure: configureOf(page),
  };
  return Object.freeze(api);
};
