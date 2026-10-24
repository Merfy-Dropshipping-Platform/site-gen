import { describe, expect, it } from 'vitest';
import { docsDate } from '../src/docs';

describe('дата документации', () => {
  it('из первой записи changelog, а не из времени генерации', () => {
    expect(docsDate('## 1.1.0 — 2026-12-01\n\n- …\n\n## 1.0.0 — 2026-11-10\n')).toBe('2026-12-01');
  });

  it('записи нет — ошибка с подсказкой', () => {
    expect(() => docsDate('# Что нового\n')).toThrow('changelog.md: нет записи «## <версия> — ГГГГ-ММ-ДД»');
  });
});
