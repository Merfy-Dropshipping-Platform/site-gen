import { inView as motionInView } from 'motion';
import type { Stop } from '../types';
import type { InViewProvider } from './types';

// Провайдер ctx.inView (13.11, часть 2б спеки анимаций): inView из Motion, тот же, что у появлений data-animate (общий
// кусок с reveal.js). Сборка кладёт файл in-view.js в бандл страницы по слову inView в скрипте секции. Работает во всех
// режимах: анимации, которые fn запускает, сами учитывают «уменьшить движение» и превью. Снятие секции — отписка.

type Margin = NonNullable<NonNullable<Parameters<typeof motionInView>[2]>['margin']>;
type Amount = 'some' | 'all' | number;

const fail = (text: string): never => {
  throw Object.assign(new Error(`ctx.inView: ${text}`), { code: 'sdk-call-invalid' });
};
const MARGIN = /^-?[\d.]+(px|%)( -?[\d.]+(px|%)){0,3}$/;
const isMargin = (value: unknown): value is Margin => typeof value === 'string' && MARGIN.test(value);
const isAmount = (value: unknown): value is Amount =>
  value === 'some' || value === 'all' || (typeof value === 'number' && value >= 0 && value <= 1);

export const inView: InViewProvider = (host, el, fn, options) => {
  const amount = options?.amount ?? 'some';
  const margin = options?.margin;
  if (!isAmount(amount)) fail("amount — 'some', 'all' или число от 0 до 1");
  if (margin !== undefined && !isMargin(margin)) fail("margin — 1–4 значения px или %, например '0px 0px -20% 0px'");
  if (typeof fn !== 'function') fail('вторым аргументом — функция');
  const view = { amount: isAmount(amount) ? amount : 'some', margin: isMargin(margin) ? margin : undefined };
  const stops = [el].flat().map((item) => {
    const node = host.scope.nodeOf(item) ?? fail('элемент не из этой секции');
    // Вход: fn под предохранителем секции; что fn вернула функцией — при выходе. once — только первый вход.
    const enter = (): (() => void) | undefined => {
      const leave = host.run('runtime', () => fn(host.scope.wrap(node)));
      if (options?.once === true) queueMicrotask(() => stop());
      else if (typeof leave === 'function')
        return () => void host.run('runtime', () => Reflect.apply(leave, undefined, []));
      return undefined;
    };
    // Нет IntersectionObserver (старый браузер) — элемент считается в экране сразу.
    const stop: Stop = window.IntersectionObserver ? motionInView(node, enter, view) : (enter(), () => undefined);
    return stop;
  });
  const stopAll = (): void => stops.forEach((stop) => stop());
  host.signal.addEventListener('abort', stopAll, { once: true });
  return stopAll;
};
