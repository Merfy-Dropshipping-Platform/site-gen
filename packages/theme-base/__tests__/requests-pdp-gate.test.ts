/**
 * Спека 118 §5 (T013c): линт-гейт встраивания «Формы заявки» в PDP.
 * Живой /product у всех 5 тем рендерит ОБЩИЙ порт Product (theme-base), куда
 * флаг темы инжектит extractPageBlocks (см. src/themes/__tests__/
 * requests-product-flag.spec.ts). Тема-компоненты ниже — fallback/demo-PDP:
 * каждая встраивает контейнер+остров за флагом features.requests СВОЕГО
 * манифеста, переиспользуя общий рантайм (без копирования логики в тему).
 * Здесь — контракт разметки по исходникам (прецедент: block-contract тесты).
 */
import fs from 'node:fs';
import path from 'node:path';

const THEMES_ROOT = path.resolve(__dirname, '../../../themes');

const PDP_COMPONENTS: Array<{ theme: string; file: string }> = [
  { theme: 'flux', file: 'FluxProductDetail.astro' },
  { theme: 'vanilla', file: 'VanillaProductDetail.astro' },
  { theme: 'satin', file: 'satinProductDetail.astro' },
  { theme: 'bloom', file: 'BloomProductDetail.astro' },
];

function read(rel: string): string {
  return fs.readFileSync(path.join(THEMES_ROOT, rel), 'utf-8');
}

describe('requests: PDP-компоненты тем (T013c)', () => {
  it.each(PDP_COMPONENTS)('$theme: контейнер+остров за флагом темы', ({ theme, file }) => {
    const src = read(`${theme}/src/components/products/${file}`);
    // контейнер и скрытие кнопок
    expect(src).toContain('data-request-form');
    expect(src).toContain('data-product-actions');
    expect(src).toContain('id="pdp-requests-form"');
    // гейт — флаг СВОЕГО манифеста, не хардкод
    expect(src).toContain(`packages/theme-${theme}/theme.json`);
    expect(src).toContain('features?.requests === true');
    expect(src).toContain('{requestsEnabled &&');
    // общий рантайм theme-base, не копия
    expect(src).toContain('REQUESTS_FORM_RUNTIME_SOURCE');
    expect(src).toContain('mountRequestsForm');
    expect(src).toContain('RequestFormSfStyles');
    expect(src).toContain('packages/theme-base/runtime/requests-form');
    // стили sf-* не дублируются в тему (значения --st-* живут в theme-base)
    expect(src).not.toContain('--st-ink:');
  });

  it('общий порт Product (theme-base): те же хуки за пропом requestsEnabled', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../blocks/Product/Product.astro'),
      'utf-8',
    );
    expect(src).toContain('requestsEnabled');
    expect(src).toContain('data-request-form');
    expect(src).toContain('data-product-actions');
    expect(src).toContain('REQUESTS_FORM_RUNTIME_SOURCE');
    expect(src).toContain('__merfyRoot(blockId)'); // Spec 102 — скоуп секции
  });

  it('все 5 theme.json: features.requests=false — дефолт выключен', () => {
    for (const t of ['rose', 'vanilla', 'flux', 'satin', 'bloom']) {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.resolve(__dirname, `../../../packages/theme-${t}/theme.json`),
          'utf-8',
        ),
      ) as { features?: Record<string, boolean> };
      expect(manifest.features?.requests).toBe(false);
    }
  });
});
