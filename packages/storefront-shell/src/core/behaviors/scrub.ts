import type { scroll } from 'motion';

// Анимации, которые ctx.scroll может крутить прокруткой (13.11): открытый объект Animation (ctx.animate, ctx.lib.motion)
// → управление Motion. Карта слабая и коду секции не видна: управление Motion держит узлы DOM, а код секции получает
// только обёртки El. Файлы animate.js, scroll.js и lib-motion.js собираются отдельно (build/behaviors.ts: общий кусок с
// полным Motion утяжелил бы аккордеон и слайдер), поэтому карта одна на страницу — в служебном __merfyScrub: имена с
// префиксом __merfy коду секции недоступны (приём секции, sdk-only).
export type Scrubbable = Exclude<Parameters<typeof scroll>[0], (...args: never[]) => unknown>;

declare global {
  var __merfyScrub: WeakMap<object, readonly Scrubbable[]> | undefined;
}

export const scrubs = (): WeakMap<object, readonly Scrubbable[]> => (globalThis.__merfyScrub ??= new WeakMap());
