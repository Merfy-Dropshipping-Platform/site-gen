import { describe, expect, it } from 'vitest';
import { StorefrontBuilderError } from '../src/errors';
import { SECTION_ERRORS_PATTERN, minuteOf, parseSectionErrors } from '../src/section-errors';

const SHOP_ID = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const HASH = 'a'.repeat(64);
const ENTRY = { section: 'nova:scarf-colors', script: HASH, stage: 'mount', message: 'сломалась при запуске' };
const DATA = { v: 1, shopId: SHOP_ID, receivedAt: '2026-10-10T12:34:56.789Z', errors: [ENTRY] };
// Сообщение шлюза в очереди — конверт Nest ClientProxy.emit: { pattern, data }.
const message = (data: Record<string, unknown> = {}) => ({
  pattern: SECTION_ERRORS_PATTERN,
  data: { ...DATA, ...data },
});

// Код ошибки разбора; разобралось — undefined.
function codeOf(body: unknown): string | undefined {
  try {
    parseSectionErrors(body);
    return undefined;
  } catch (error) {
    return error instanceof StorefrontBuilderError ? error.code : 'не StorefrontBuilderError';
  }
}

describe('сообщение очереди storefront_section_errors', () => {
  it('пачка → строки: отпечаток с приставкой sha256:, минута приёма', () => {
    expect(parseSectionErrors(message())).toEqual({
      shopId: SHOP_ID,
      minute: '2026-10-10T12:34:00.000Z',
      rows: [
        {
          section: 'nova:scarf-colors',
          scriptHash: `sha256:${HASH}`,
          stage: 'mount',
          message: 'сломалась при запуске',
          count: 1,
        },
      ],
    });
  });

  it('одинаковые записи пачки — одна строка со счётчиком', () => {
    const other = { ...ENTRY, stage: 'runtime' };
    const { rows } = parseSectionErrors(message({ errors: [ENTRY, other, ENTRY] }));
    expect(rows.map((row) => [row.stage, row.count])).toEqual([
      ['mount', 2],
      ['runtime', 1],
    ]);
  });

  it.each([
    ['чужой pattern', { ...message(), pattern: 'storefront.other' }],
    ['версия 2', message({ v: 2 })],
    ['время приёма не ISO', message({ receivedAt: '10.10.2026 12:34' })],
    ['11 записей', message({ errors: Array.from({ length: 11 }, () => ENTRY) })],
    ['отпечаток не 64 знака', message({ errors: [{ ...ENTRY, script: 'abc' }] })],
    ['чужая стадия', message({ errors: [{ ...ENTRY, stage: 'boot' }] })],
  ])('%s — message-invalid', (_case, body) => {
    expect(codeOf(body)).toBe('message-invalid');
  });

  it('минута — секунды и доли отброшены', () => {
    expect(minuteOf('2026-10-10T23:59:59.999Z')).toBe('2026-10-10T23:59:00.000Z');
  });
});
