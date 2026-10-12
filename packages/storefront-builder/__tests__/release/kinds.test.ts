import { describe, expect, it } from 'vitest';
import { KINDS, isBreakage, type ReachedManifest } from '../../src/release/kinds';
import type { ReleaseRow } from '../../src/release/store';

const RELEASE: ReleaseRow = {
  id: 3,
  kind: 'theme',
  subject: 'nova',
  fromVersion: '0.1.2',
  toVersion: '0.2.0',
  toHash: `sha256:${'2'.repeat(64)}`,
  contour: 'dev',
  startedBy: 'тест',
  status: 'waves',
  wave: 1,
  nextWaveAt: null,
  stopReason: null,
  report: {},
};

const manifestOf = (version: string, contentHash: string, renderHash = 'sha256:r'): ReachedManifest => ({
  theme: { id: 'nova', version, contentHash },
  platform: { renderHash },
});

describe('виды выпуска данными (design.md блока 10)', () => {
  it('тема дошла — номер и отпечаток темы в манифесте живой сборки', () => {
    expect(KINDS.theme.reached(manifestOf('0.2.0', RELEASE.toHash), RELEASE)).toBe(true);
    expect(KINDS.theme.reached(manifestOf('0.1.2', RELEASE.toHash), RELEASE)).toBe(false);
    expect(KINDS.theme.reached(manifestOf('0.2.0', 'sha256:other'), RELEASE)).toBe(false);
  });

  it('платформа дошла — отпечаток платформы в манифесте', () => {
    const platform: ReleaseRow = { ...RELEASE, kind: 'platform', subject: 'platform', toHash: 'sha256:p' };
    expect(KINDS.platform.reached(manifestOf('0.1.2', 'x', 'sha256:p'), platform)).toBe(true);
    expect(KINDS.platform.reached(manifestOf('0.1.2', 'x', 'sha256:old'), platform)).toBe(false);
  });

  it('тема — «да» после тестового магазина, закрепление, откат без паузы; платформа — наоборот', () => {
    expect([KINDS.theme.approval, KINDS.theme.pin, KINDS.theme.pauseOnRevert]).toEqual([true, true, false]);
    expect([KINDS.platform.approval, KINDS.platform.pin, KINDS.platform.pauseOnRevert]).toEqual([false, false, true]);
    expect(KINDS.theme.expectedVersion(RELEASE)).toBe('0.2.0');
    expect(KINDS.platform.expectedVersion(RELEASE)).toBeNull();
  });

  it('сбой данных — не поломка; рисование и проверки сборки — поломка', () => {
    const data = ['rpc-failed', 'data-not-received', 'shop-invalid', 'unknown'];
    const version = ['render-failed', 'build-blocked', 'inputs-invalid', 'renderer-archive'];
    expect(data.map(isBreakage)).toEqual([false, false, false, false]);
    expect(version.map(isBreakage)).toEqual([true, true, true, true]);
  });
});
