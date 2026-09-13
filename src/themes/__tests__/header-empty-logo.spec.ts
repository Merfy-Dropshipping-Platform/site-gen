import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Пункт 11 пачки тестировщика (13.09), витринная половина: «если нет файла —
 * вставляется из настроек админки название магазина».
 *
 * Замер «до» (чтением исходника packages/theme-base/blocks/Header/Header.astro):
 * во ВСЕХ шести раскладках стоял безусловный `<img src={logo} …>`. Пустой
 * `logo` (а это дефолт блока: `defaultProps.logo = ''`) давал
 * `<img src="">` — браузер рисует «битую картинку», названия магазина не
 * показывалось нигде.
 *
 * Порты тем (rose/satin/bloom) текст siteTitle при пустом логотипе уже рисуют —
 * здесь закрываем ОБЩИЙ блок, который остаётся на страницах, что не проходят
 * пересборку v2 (не-unified cart/product, темы без нарезки).
 *
 * Рендерим скомпилированный артефакт (dist/astro-blocks), а не исходный текст.
 */
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const SITES_ROOT = resolve(__dirname, '..', '..', '..');

const LAYOUTS = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center-absolute',
] as const;

const baseProps = {
  id: 'Header-1',
  siteTitle: 'Магазин Ромашка',
  menuType: 'dropdown',
  colorScheme: 1,
  padding: { top: 24, bottom: 24 },
  navigationLinks: [{ label: 'Каталог', href: '/catalog' }],
  actionButtons: { showSearch: true, showCart: true, showProfile: true },
};

function renderHeader(props: Record<string, unknown>): string {
  const jobs = [{ block: 'Header', pkg: 'theme-base', props: { ...baseProps, ...props } }];
  const raw = execFileSync('node', [RENDERER, 'rose', JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as { html?: string; error?: string }[];
  if (rows[0]?.error) throw new Error(rows[0].error);
  return rows[0]?.html ?? '';
}

const built = existsSync(resolve(SITES_ROOT, 'dist', 'astro-blocks', 'manifest.json'));

describe('общая шапка theme-base — логотип не загружен', () => {
  it('блоки скомпилированы (pnpm build:blocks)', () => {
    expect(built).toBe(true);
  });

  it.each(LAYOUTS)('раскладка %s: пустой логотип → название магазина текстом', (logoPosition) => {
    if (!built) return;
    const html = renderHeader({ logo: '', logoPosition });
    expect(html).not.toContain('src=""');
    expect(html).toContain('Магазин Ромашка');
  });

  it('загруженный логотип по-прежнему рисуется картинкой', () => {
    if (!built) return;
    const html = renderHeader({ logo: 'https://minio.example/logo.png', logoPosition: 'top-left' });
    expect(html).toContain('src="https://minio.example/logo.png"');
  });
});
