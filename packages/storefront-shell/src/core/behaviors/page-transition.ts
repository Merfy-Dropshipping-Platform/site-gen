// Переходы между страницами (13.11, часть 2д спеки анимаций): View Transitions API между документами — витрина обычная
// MPA, без SPA. Выбор словаря «choice-page-transition» (none, fade, slide; по умолчанию none): при fade и slide сборка
// встраивает в <head> каждой страницы магазина CSS ниже и скрипт имён (storefront-build/src/head.ts; CSP — по хешу
// скрипта, csp.ts). Браузер без поддержки игнорирует @view-transition — обычный переход. «Уменьшить движение» — без
// перехода: правило под @media (prefers-reduced-motion: no-preference).
//
// Общий элемент (фото в карточке → фото на странице товара) — атрибут data-vt="<имя>" на обеих страницах; имя
// view-transition-name ставит этот скрипт: vt-<имя>, знаки кроме букв, цифр, «_» и «-» → «-». На уходящей странице
// (pageswap) — только у элементов вне ссылок и внутри ссылки, по которой ушли: у карточек каталога имена разные, а
// захватывать все незачем. На новой (pagereveal) — у всех [data-vt]. Повтор имени на странице сорвал бы весь переход,
// поэтому имя получает только первый элемент.

export const PAGE_TRANSITIONS = ['none', 'fade', 'slide'] as const;
export type PageTransition = (typeof PAGE_TRANSITIONS)[number];
export const PAGE_TRANSITION_ATTRIBUTE = 'data-page-transition';

export const PAGE_TRANSITION_SCRIPT =
  '(()=>{const r=matchMedia("(prefers-reduced-motion: reduce)"),n=t=>{const s=new Set;' +
  'document.querySelectorAll("[data-vt]").forEach(e=>{const v="vt-"+(e.getAttribute("data-vt")||"").replace(/[^a-zA-Z0-9_-]/g,"-"),' +
  'a=e.closest("a[href]");if(s.has(v)||(t&&a&&a.href!==t))return;s.add(v);e.style.viewTransitionName=v})};' +
  'addEventListener("pageswap",e=>{e.viewTransition&&!r.matches&&n(e.activation&&e.activation.entry&&e.activation.entry.url||"")});' +
  'addEventListener("pagereveal",e=>{e.viewTransition&&!r.matches&&n("")})})()';

const AUTO = '@view-transition{navigation:auto}';
const SLIDE =
  '::view-transition-old(root){animation:.28s cubic-bezier(.4,0,.2,1) both merfy-vt-out}' +
  '::view-transition-new(root){animation:.28s cubic-bezier(.4,0,.2,1) both merfy-vt-in}';
const SLIDE_KEYFRAMES =
  '@keyframes merfy-vt-out{to{opacity:0;transform:translateX(-24px)}}' +
  '@keyframes merfy-vt-in{from{opacity:0;transform:translateX(24px)}}';

// CSS перехода: fade — затухание страницы целиком (у браузера оно по умолчанию), slide — сдвиг с затуханием; none — ''.
export function pageTransitionCss(kind: PageTransition): string {
  if (kind === 'none') return '';
  const inner = kind === 'slide' ? `${AUTO}${SLIDE}` : AUTO;
  return `@media (prefers-reduced-motion:no-preference){${inner}}${kind === 'slide' ? SLIDE_KEYFRAMES : ''}`;
}

export const isPageTransition = (value: unknown): value is PageTransition =>
  PAGE_TRANSITIONS.some((kind) => kind === value);
