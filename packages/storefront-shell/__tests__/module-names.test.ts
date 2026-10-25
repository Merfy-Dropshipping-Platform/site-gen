import { describe, expect, it } from 'vitest';
import { ACTIONS, ACTION_EVENTS, MODULE_NAMES, MODULE_NAMES_COMPLETE } from '../src/core/action-catalog';

// Модули SDK и события data-action для проверки при сохранении (блок 5 «Секций и SDK», часть 5в): проверка в
// storefront-sections сверяет "uses" section.json и data-action по этим спискам ядра.
describe('MODULE_NAMES и ACTION_EVENTS', () => {
  it('модули SDK — восемь, у каждого действия SDK модуль из списка', () => {
    expect(MODULE_NAMES).toEqual([
      'cart',
      'favorites',
      'auth',
      'newsletter',
      'consent',
      'variants',
      'search',
      'catalog',
    ]);
    expect(MODULE_NAMES_COMPLETE).toBe(true);
    expect(Object.values(ACTIONS).every((spec) => MODULE_NAMES.some((name) => name === spec.module))).toBe(true);
  });

  it('события data-action — те же 20 имён, что слушает ядро', () => {
    expect(ACTION_EVENTS).toHaveLength(20);
    expect(ACTION_EVENTS).toContain('click');
    expect(ACTION_EVENTS).toContain('submit');
  });
});
