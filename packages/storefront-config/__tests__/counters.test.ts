import { describe, expect, it } from 'vitest';
import { COUNTER_KINDS, COUNTER_NUMBERS, isCounterNumber, type CounterKind } from '../src/schema';

// Правила номеров счётчиков мерчанта (design.md блока 11, С11-4 Б): номер вписывается в код счётчика, поэтому проходят
// только цифры, латиница и дефис — по правилу своего вида.
describe('номера счётчиков мерчанта', () => {
  it('три вида, у каждого правило', () => {
    expect(COUNTER_KINDS).toEqual(['metrika', 'vk', 'google']);
    expect(Object.keys(COUNTER_NUMBERS).sort()).toEqual(['google', 'metrika', 'vk']);
  });

  it.each<[CounterKind, string, boolean]>([
    ['metrika', '12345678', true],
    ['metrika', '0123', false],
    ['metrika', '1234567890123', false],
    ['metrika', '123");alert(1)//', false],
    ['vk', 'VK-RTRG-1234567-AbCdE', true],
    ['vk', 'VK-RTRG-1234567', false],
    ['vk', 'VK-RTRG-1-"><script>', false],
    ['google', 'G-ABC123XYZ9', true],
    ['google', 'UA-12345-1', false],
    ['google', 'g-abc123', false],
  ])('%s %s → %s', (kind, number, valid) => {
    expect(isCounterNumber(kind, number)).toBe(valid);
  });
});
