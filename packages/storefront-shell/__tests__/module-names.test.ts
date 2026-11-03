import { describe, expect, it } from 'vitest';
import { ACTIONS, ACTION_EVENTS, MODULE_NAMES, MODULE_NAMES_COMPLETE, OVERLAY_PART } from '../src/core/action-catalog';

// Модули SDK и события data-action для проверки при сохранении (блок 5 «Секций и SDK», часть 5в): проверка в
// storefront-sections сверяет "uses" section.json и data-action по этим спискам ядра.
describe('MODULE_NAMES и ACTION_EVENTS', () => {
  it('модули SDK — четырнадцать, у каждого действия SDK модуль из списка или часть окон overlay', () => {
    expect(MODULE_NAMES).toEqual([
      'cart',
      'favorites',
      'customer',
      'auth',
      'newsletter',
      'consent',
      'variants',
      'search',
      'catalog',
      'orders',
      'files',
      'share',
      'page',
      'checkout',
    ]);
    expect(MODULE_NAMES_COMPLETE).toBe(true);
    // overlay.close (01.11) — действие окна поверх страницы: ctx.overlay не модуль по uses.
    const modules = Object.values(ACTIONS).map((spec) => spec.module);
    expect(modules.filter((module) => !MODULE_NAMES.some((name) => name === module))).toEqual([OVERLAY_PART]);
  });

  it('события data-action — те же 20 имён, что слушает ядро', () => {
    expect(ACTION_EVENTS).toHaveLength(20);
    expect(ACTION_EVENTS).toContain('click');
    expect(ACTION_EVENTS).toContain('submit');
  });
});
