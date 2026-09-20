import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Хвост бага тестера #5. Первая правка ушла в `theme-base/blocks/Catalog`, но
 * замер прода 20.09 показал, что живые витрины рендерят НЕ его: в HTML каталога
 * нет ни `applyFilters`, ни `urlState` — у каждой темы свой порт блока
 * `packages/theme-<t>/blocks/Catalog/Catalog.astro` с инлайн-гидрацией
 * («storefront-hydrate»), и товары он грузит постранично с СЕРВЕРНЫМИ фильтрами
 * через `/api/store/products`.
 *
 * Сам API искать умеет — замер live: `q=Bloom` → 1 товар из 6. Витрина просто
 * не передавала параметр. Поэтому каждый порт обязан читать `q` из адреса и
 * класть его в запрос; иначе поиск по магазину снова станет немым.
 */
const THEMES = ['rose', 'flux', 'bloom', 'satin', 'vanilla'] as const;

const portSource = (theme: string) =>
  readFileSync(
    join(__dirname, '..', '..', `theme-${theme}`, 'blocks', 'Catalog', 'Catalog.astro'),
    'utf8',
  );

describe('поиск доезжает до живого каталога каждой темы', () => {
  it.each(THEMES)('%s: читает q из адреса', (theme) => {
    const src = portSource(theme);
    expect(src).toContain('new URLSearchParams(window.location.search).get("q")');
  });

  it.each(THEMES)('%s: кладёт запрос в /api/store/products', (theme) => {
    const src = portSource(theme);
    expect(src).toContain('qp.set("q", searchQ)');
    expect(src).toContain('filters.query');
  });
});
