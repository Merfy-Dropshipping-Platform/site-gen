import { describe, expect, it } from 'vitest';
import { PRIORITY, priorityOf } from '../../src/events';
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

// Выпуск нашей секции (блок 15, часть 15з, Р15з-6, Р15з-7): toVersion — хеш исходника, toHash — хеш правки.
describe('выпуск нашей секции', () => {
  const SECTION: ReleaseRow = {
    ...RELEASE,
    kind: 'section',
    subject: 'shop:cart-badge',
    fromVersion: 'seed',
    toVersion: `sha256:${'5'.repeat(64)}`,
    toHash: `sha256:${'6'.repeat(64)}`,
  };
  const withSections = (sections?: { name: string; hash: string }[]): ReachedManifest =>
    sections === undefined ? manifestOf('0.1.2', 'x') : { ...manifestOf('0.1.2', 'x'), sections };

  it('дошёл — секция с новым хешем или её нет на страницах; старый хеш и манифест без списка — нет', () => {
    expect(KINDS.section.reached(withSections([{ name: 'shop:cart-badge', hash: SECTION.toHash }]), SECTION)).toBe(true);
    expect(KINDS.section.reached(withSections([{ name: 'shop:hero', hash: 'sha256:h' }]), SECTION)).toBe(true);
    expect(KINDS.section.reached(withSections([{ name: 'shop:cart-badge', hash: 'sha256:old' }]), SECTION)).toBe(false);
    expect(KINDS.section.reached(withSections(), SECTION)).toBe(false);
  });

  it('без «да» и закрепления, откат с паузой, неизменная сборка — пропуск; событие с приоритетом выпуска', () => {
    const rules = KINDS.section;
    expect([rules.approval, rules.pin, rules.pauseOnRevert, rules.leaveUnchanged]).toEqual([false, false, true, true]);
    expect([rules.event, rules.expectedVersion(SECTION)]).toEqual(['section-release', null]);
    expect(priorityOf('section-release')).toBe(PRIORITY.release);
  });
});
