import { scroll as motionScroll } from 'motion';
import type { Stop } from '../types';
import { scrubs } from './scrub';
import type { ScrollProvider } from './types';

// Провайдер ctx.scroll (13.11, часть 2б спеки анимаций): scroll из Motion. Сборка кладёт файл scroll.js в бандл страницы
// по слову scroll в скрипте секции (storefront-build/src/features.ts; лишние 3,6 КБ на ложном срабатывании допустимы).
// «Уменьшить движение» и запуск в превью после правки настроек или текста (prefs.ts, still) — не следит: анимация уже на последнем кадре, fn получает 1. Анимацию крутит нативный
// ScrollTimeline, где он есть, иначе Motion двигает её время по кадрам; снятие секции — отписка. Файл стоит в бюджете
// 4096 Б вместе с кодом Motion (3,6 КБ), поэтому проверки короткие.

type Offset = NonNullable<NonNullable<Parameters<typeof motionScroll>[1]>['offset']>;

const fail = (text: string): never => {
  throw Object.assign(new Error(`ctx.scroll: ${text}`), { code: 'sdk-call-invalid' });
};

// Край: start, center, end, доля 0…1 или число с px, %, vh, vw; пара краёв — через пробел.
const EDGE = '(start|center|end|-?[\\d.]+(px|%|vh|vw)?)';
const OFFSET = new RegExp(`^${EDGE}( ${EDGE})?$`);
const isOffset = (value: unknown): value is Offset =>
  Array.isArray(value) && value.every((item) => typeof item === 'string' && OFFSET.test(item));

export const scroll: ScrollProvider = (host, target, run, options) => {
  const offset = options?.offset;
  const at = {
    target: host.scope.nodeOf(target) ?? fail('элемент не из этой секции'),
    offset: offset === undefined || isOffset(offset) ? offset : fail("offset — ['start end', 'end start'] и т. п."),
  };
  const still = host.still();
  let stops: readonly Stop[];
  if (typeof run === 'function') {
    if (still) host.run('runtime', () => run(1));
    stops = still ? [] : [motionScroll((progress: number) => void host.run('runtime', () => run(progress)), at)];
  } else {
    const controls = scrubs().get(run) ?? fail('анимация — ответ ctx.animate или ctx.lib.motion');
    stops = still ? [] : controls.map((item) => motionScroll(item, at));
  }
  const stopAll = (): void => stops.forEach((stop) => stop());
  host.signal.addEventListener('abort', stopAll, { once: true });
  return stopAll;
};
