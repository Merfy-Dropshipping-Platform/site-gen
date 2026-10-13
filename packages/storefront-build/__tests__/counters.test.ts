import { describe, expect, it } from 'vitest';
import { countersOf } from '../src/counters';
import { StorefrontBuildError } from '../src/errors';
import type { Entity } from '../src/inputs';
import { standInputs } from './support';

const counter = (id: string, kind: string, number: string): Entity => ({
  type: 'counter',
  id,
  updatedAt: '1970-01-01T00:00:00.000Z',
  data: { kind, number },
});

function buildErrorOf(run: () => unknown): StorefrontBuildError {
  try {
    run();
  } catch (error) {
    if (error instanceof StorefrontBuildError) return error;
    throw error;
  }
  throw new Error('счётчики приняты, а не должны');
}

describe('countersOf (design.md блока 11, С11-4 Б)', () => {
  it('счётчик стенда — в конфиг страницы', () => {
    expect(countersOf(standInputs.data.entities)).toEqual([{ kind: 'metrika', number: '12345678' }]);
  });

  it('порядок — по виду и номеру, одинаковая пара — один раз, другие сущности — мимо', () => {
    const others = standInputs.data.entities.filter((entity) => entity.type !== 'counter');
    const entities = [
      counter('c-3', 'vk', 'VK-RTRG-1-a'),
      counter('c-1', 'metrika', '222'),
      counter('c-2', 'metrika', '111'),
      counter('c-4', 'metrika', '111'),
      ...others,
    ];
    expect(countersOf(entities)).toEqual([
      { kind: 'metrika', number: '111' },
      { kind: 'metrika', number: '222' },
      { kind: 'vk', number: 'VK-RTRG-1-a' },
    ]);
  });

  it('номер не по правилу вида — inputs-invalid с путём сущности', () => {
    const error = buildErrorOf(() =>
      countersOf([counter('c-1', 'metrika', '111'), counter('c-2', 'google', 'UA-1-1')]),
    );
    expect([error.code, error.path]).toEqual(['inputs-invalid', 'data.entities.1.data']);
  });

  it('вид не из трёх — inputs-invalid', () => {
    expect(buildErrorOf(() => countersOf([counter('c-1', 'custom', '<script>')])).code).toBe('inputs-invalid');
  });
});
