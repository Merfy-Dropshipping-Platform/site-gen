import type { Behavior, BehaviorHost, BehaviorInstance } from './types';

// Шапка при прокрутке (design.md блока 6, раздел 8; блок 7, п. 14; Р6-16): ставит и снимает только data-hidden,
// сдвиг и переход — классы обёртки блока 7. Режим data-mode читается на каждой прокрутке — конструктор меняет его
// без перезагрузки.
// При запуске ничего не читаем: scrollY и getBoundingClientRect заставляют браузер считать раскладку страницы внутри
// задачи запуска секций (замер на стенде 19.11.2026, коллекция, ЦП ×4: 85 из 196 мс запуска; без чтения TBT 33–34 мс
// против 43–98). Прежнее положение — начало страницы, первое чтение — на первой прокрутке: до неё скрывать нечего.

const HIDE_MARGIN_PX = 1;

export const stickyHeader: Behavior<'sticky-header'> = {
  name: 'sticky-header',
  attach(host: BehaviorHost): BehaviorInstance {
    let lastY = 0;
    const update = (): void => {
      const mode = host.root.getAttribute('data-mode') ?? 'scroll-up';
      const y = window.scrollY;
      const height = host.root.getBoundingClientRect().height;
      const goingDown = y > lastY + HIDE_MARGIN_PX;
      lastY = y;
      if (mode !== 'scroll-up') {
        host.root.removeAttribute('data-hidden');
        return;
      }
      const belowSelf = y > height;
      host.root.toggleAttribute('data-hidden', goingDown && belowSelf);
    };
    window.addEventListener('scroll', update, { passive: true, signal: host.signal });
    return {};
  },
};
