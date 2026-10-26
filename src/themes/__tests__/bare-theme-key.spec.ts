/**
 * Один способ получить голый ключ темы: `rose-1.0` / `satin@2` → `rose` / `satin`.
 * Им пользуются сборка превью, ассеты и флаги блока «Товар» (applyProductThemeFeatures).
 */
import { PreviewService } from '../../services/preview.service';
import { applyProductThemeFeatures } from '../page-blocks';
import { bareThemeKey, getThemeManifest } from '../theme-manifest-loader';

describe('bareThemeKey', () => {
  it.each([
    ['rose', 'rose'],
    ['rose-1.0', 'rose'],
    ['satin@2', 'satin'],
    ['flux-2@3', 'flux'],
  ])('%s → %s', (input, expected) => {
    expect(bareThemeKey(input)).toBe(expected);
  });

  it('PreviewService.bareThemeKey — тот же результат, не вторая копия правила', () => {
    for (const id of ['rose-1.0', 'satin@2', 'flux']) {
      expect(PreviewService.bareThemeKey(id)).toBe(bareThemeKey(id));
    }
  });
});

describe('applyProductThemeFeatures с версионным идентификатором темы', () => {
  it('flux@2 ставит те же флаги, что и flux', () => {
    const plain: Record<string, unknown> = {};
    const versioned: Record<string, unknown> = {};
    applyProductThemeFeatures(plain, 'flux');
    applyProductThemeFeatures(versioned, 'flux@2');

    expect(getThemeManifest('flux')).not.toBeNull();
    expect(versioned).toEqual(plain);
  });
});
