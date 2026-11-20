// Какие сборки ставят аудит после публикации: только запущенные публикацией (мерчант или агент). Волны выпуска платформы,
// тем и секций, сверка, правка записей расширения, правка товара и перезапуск аудит не ставят.
import { describe, expect, it } from 'vitest';
import { fromPublish } from '../src/build-job';
import { EXTENSION_RECORD_CHANGE, priorityOf } from '../src/events';

const buildOf = (type: string): { priority: number } => ({ priority: priorityOf(type) });

describe('аудит ставит только публикация', () => {
  it('публикация мерчанта или агента (merchant-publish) — да', () => {
    expect(fromPublish(buildOf('merchant-publish'))).toBe(true);
  });

  it.each([
    ['выпуск платформы', 'platform-release'],
    ['выпуск темы', 'theme-release'],
    ['выпуск расширения', 'extension-release'],
    ['выпуск секции', 'section-release'],
    ['часовая сверка', 'reconcile'],
    ['правка записи расширения', EXTENSION_RECORD_CHANGE],
    ['перезапуск', 'restart'],
    ['правка товара', 'product-change'],
    ['старый путь сборки', 'old-path'],
  ])('%s — нет', (_name, type) => {
    expect(fromPublish(buildOf(type))).toBe(false);
  });

  it('публикация склеилась с правкой в одно задание — приоритет публикации, аудит нужен', () => {
    const merged = Math.max(priorityOf('restart'), priorityOf('merchant-publish'));
    expect(fromPublish({ priority: merged })).toBe(true);
  });
});
