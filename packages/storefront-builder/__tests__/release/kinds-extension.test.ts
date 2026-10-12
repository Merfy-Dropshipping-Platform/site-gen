import { describe, expect, it } from 'vitest';
import { KINDS, type ReachedManifest } from '../../src/release/kinds';
import type { ReleaseRow } from '../../src/release/store';

const HASH = `sha256:${'a'.repeat(64)}`;
const RELEASE: ReleaseRow = {
  id: 1,
  kind: 'extension',
  subject: 'reviews',
  fromVersion: '1.1.0',
  toVersion: '1.2.0',
  toHash: '1.2.0',
  contour: 'dev',
  startedBy: 'test',
  status: 'waves',
  wave: 1,
  nextWaveAt: null,
  stopReason: null,
  report: {},
};
const manifest = (extensions?: ReachedManifest['extensions']): ReachedManifest => ({
  theme: { id: 'nova', version: '0.0.1', contentHash: HASH },
  platform: { renderHash: HASH },
  ...(extensions === undefined ? {} : { extensions }),
});

describe('выпуск расширения дошёл до магазина (задача 11)', () => {
  it('дошёл: в манифесте расширение той же версии', () => {
    expect(KINDS.extension.reached(manifest([{ id: 'reviews', version: '1.2.0' }]), RELEASE)).toBe(true);
  });

  it('не дошёл: другая версия, другое расширение или поля нет', () => {
    expect(KINDS.extension.reached(manifest([{ id: 'reviews', version: '1.1.0' }]), RELEASE)).toBe(false);
    expect(KINDS.extension.reached(manifest([{ id: 'faq', version: '1.2.0' }]), RELEASE)).toBe(false);
    expect(KINDS.extension.reached(manifest(), RELEASE)).toBe(false);
  });

  it('пропуск при той же сборке — только у платформы', () => {
    expect([KINDS.theme.leaveUnchanged, KINDS.platform.leaveUnchanged, KINDS.extension.leaveUnchanged]).toEqual([
      false,
      true,
      false,
    ]);
  });
});
