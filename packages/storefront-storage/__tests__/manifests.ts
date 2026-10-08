import { checkManifest, sha256, type StorefrontManifest } from '@merfy/storefront-build';

// Сборки для тестов: манифест блока 4 (проходит его схему) и файлы с содержимым. Страница задаётся адресом и
// сущностью «тип:id»; файл страницы, отпечатки, зависимости и карта сущностей считаются здесь.

export const SHOP = '00000000-0000-4000-8000-000000000001';
export const UPDATED_AT = '2026-10-06T09:00:00.000Z';
export const HOME = { path: '/', entity: `site:${SHOP}` };
export const SCARF = { path: '/products/scarf/', entity: 'product:00000000-0000-4000-8000-000000000101' };
export const STYLES = '_astro/index.css';

export interface PageSpec {
  path: string;
  entity: string;
  updatedAt?: string;
}

export interface TestFile {
  path: string;
  content: Uint8Array;
}

export interface TestBuild {
  manifest: StorefrontManifest;
  files: TestFile[];
}

const encoder = new TextEncoder();
const fileOf = (path: string): string => (path === '/' ? 'index.html' : `${path.slice(1)}index.html`);
const pageText = (spec: PageSpec): string => `<!doctype html><title>${spec.path}</title>${spec.entity}`;

// Строку страницы проверяет схема манифеста блока 4 в buildOf: тип сущности — из её списка.
function pageRow(spec: PageSpec): Record<string, unknown> {
  const [type, id] = spec.entity.split(':');
  return {
    path: spec.path,
    file: fileOf(spec.path),
    hash: sha256(pageText(spec)),
    entity: { type, id },
    deps: [spec.entity],
    dataUpdatedAt: spec.updatedAt ?? UPDATED_AT,
  };
}

// extra — файлы сверх страниц: путь от корня сайта → содержимое. Стили темы есть в каждой сборке.
export function buildOf(pages: PageSpec[], extra: Record<string, string> = {}): TestBuild {
  const texts: Record<string, string> = { [STYLES]: 'body{color:#111}', ...extra };
  pages.forEach((spec) => (texts[fileOf(spec.path)] = pageText(spec)));
  const manifest = checkManifest({
    v: 1,
    key: sha256(JSON.stringify(pages)),
    platform: { commit: '0123456789abcdef0123456789abcdef01234567', renderHash: `sha256:${'1'.repeat(64)}` },
    theme: { id: 'nova', version: '0.0.1', contentHash: `sha256:${'2'.repeat(64)}` },
    shell: null,
    shop: { id: SHOP },
    entities: Object.fromEntries(pages.map((spec) => [spec.entity, sha256(spec.entity)])),
    files: Object.fromEntries(Object.entries(texts).map(([path, text]) => [path, sha256(text)])),
    pages: pages.map(pageRow),
  });
  const files = Object.entries(texts).map(([path, text]) => ({ path, content: encoder.encode(text) }));
  return { manifest, files };
}
