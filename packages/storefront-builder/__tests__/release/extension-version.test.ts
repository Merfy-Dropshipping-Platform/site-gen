import { describe, expect, it } from 'vitest';
import { StorefrontBuilderError } from '../../src/errors';
import { EXTENSION_VERSION_PATTERN, parseExtensionVersion } from '../../src/release/extension-version';

// Сообщение сервиса extensions о новой зарегистрированной версии: Nest emit в очередь storefront_extension_versions.
const message = (data: unknown) => ({ pattern: EXTENSION_VERSION_PATTERN, data });
const codeOf = (run: () => unknown): string | null => {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof StorefrontBuilderError ? error.code : 'other';
  }
};
const GOOD = { v: 1, extensionId: 'test-ext', version: '0.2.5', registeredAt: '2026-11-04T10:00:00.000Z' };

describe('сообщение о новой версии расширения', () => {
  it('разбирается в расширение и версию', () => {
    expect(parseExtensionVersion(message(GOOD))).toEqual({ extensionId: 'test-ext', version: '0.2.5' });
  });

  it('версия с суффиксом допустима', () => {
    expect(parseExtensionVersion(message({ ...GOOD, version: '1.0.0-rc.1' })).version).toBe('1.0.0-rc.1');
  });

  it.each([
    ['чужой pattern', { pattern: 'other', data: GOOD }],
    ['нет версии', message({ ...GOOD, version: undefined })],
    ['версия не x.y.z', message({ ...GOOD, version: 'latest' })],
    ['id с заглавными', message({ ...GOOD, extensionId: 'Test' })],
    ['не v1', message({ ...GOOD, v: 2 })],
    ['не объект', 'text'],
  ])('негодное (%s) — message-invalid', (_name, body) => {
    expect(() => parseExtensionVersion(body)).toThrowError(StorefrontBuilderError);
    expect(codeOf(() => parseExtensionVersion(body))).toBe('message-invalid');
  });
});
