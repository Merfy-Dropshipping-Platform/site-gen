import type { Dictionary } from '@merfy/tokens';
import { sha256 } from './canonical';
import { StorefrontBuildError } from './errors';
import { sectionCss } from './section-css';

// Рендер секций страницы (блок 1 «Секций и SDK», Р1, Р2): модуль шаблона по отпечатку и значения настроек → HTML
// секции. Пакет Astro и компилятор не подключает: функцию рендера даёт сборщик — процесс рендера storefront-sections
// (render.ts). Обёртка — <merfy-section data-section data-section-id class="py-section">: по data-section-id превью
// выбирает и заменяет секцию. CSS секций — классы Tailwind из их разметки (section-css.ts).
export type SettingValues = Readonly<Record<string, string | boolean>>;

export interface SectionRenderRequest {
  section: string;
  hash: string;
  module: string;
  settings: SettingValues;
}

export type RenderSection = (request: SectionRenderRequest) => Promise<string>;

// Модули рендера по отпечатку и функция рендера.
export interface SectionsRender {
  modules: ReadonlyMap<string, string>;
  render: RenderSection;
}

// live — сборка и дорисовка опубликованного сайта; preview — превью конструктора.
export type PageMode = 'live' | 'preview';

export interface PageRender {
  sections: SectionsRender;
  mode: PageMode;
}

// Экземпляр секции на странице: id, полное имя, отпечаток модуля рендера и значения всех настроек.
export interface PlacedSection {
  id: string;
  name: string;
  hash: string;
  settings: SettingValues;
}

export interface PageContent {
  sections: string[];
  sectionsCss: string;
  mode: PageMode;
}

export const WRAPPER_CLASS = 'py-section';

// Без процесса рендера: страница без секций рисуется, страница с секцией — ошибка render-failed.
export const NO_SECTIONS: SectionsRender = {
  modules: new Map(),
  render: () => Promise.reject(new Error('нет процесса рендера секций')),
};
export const LIVE_PAGE: PageRender = { sections: NO_SECTIONS, mode: 'live' };
export const EMPTY_PAGE_CONTENT: PageContent = { sections: [], sectionsCss: '', mode: 'live' };

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;' };
const escapeHtml = (text: string): string => text.replace(/[&"<>']/g, (char) => ESCAPES[char] ?? char);
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const wrapper = (placed: PlacedSection, html: string): string =>
  `<merfy-section data-section="${escapeHtml(placed.name)}" data-section-id="${escapeHtml(placed.id)}" class="${WRAPPER_CLASS}">${html}</merfy-section>`;

// Ошибка рендера секции (Р2): на опубликованном сайте — ошибка сборки, сборку не выкладываем; в превью — блок с именем
// секции и текстом ошибки в красной рамке.
const ON_RENDER_ERROR: Record<PageMode, (placed: PlacedSection, error: unknown) => string> = {
  live: (placed, error) => {
    throw new StorefrontBuildError('render-failed', `секция ${placed.name} не отрисовалась: ${errorText(error)}`, {
      path: placed.id,
      cause: error,
    });
  },
  preview: (placed, error) =>
    `<div data-merfy-error style="border:2px solid #dc2626;padding:16px;color:#dc2626;font:14px/1.4 system-ui,sans-serif">Секция ${escapeHtml(placed.name)} не отрисовалась: ${escapeHtml(errorText(error))}</div>`,
};

export async function renderSection(placed: PlacedSection, sections: SectionsRender, mode: PageMode): Promise<string> {
  const module = sections.modules.get(placed.hash);
  if (module === undefined || sha256(Buffer.from(module, 'utf8')) !== placed.hash)
    throw new StorefrontBuildError('code-missing', 'нет модуля рендера секции с этим отпечатком', { path: placed.hash });
  try {
    const html = await sections.render({ section: placed.name, hash: placed.hash, module, settings: placed.settings });
    return wrapper(placed, html);
  } catch (error) {
    return wrapper(placed, ON_RENDER_ERROR[mode](placed, error));
  }
}

// Секции страницы по порядку и CSS их классов. Секций нет — процесс рендера не нужен, Tailwind не собирается.
export async function renderPlacedSections(
  placed: readonly PlacedSection[],
  dictionary: Dictionary,
  page: PageRender,
): Promise<PageContent> {
  if (placed.length === 0) return { ...EMPTY_PAGE_CONTENT, mode: page.mode };
  const sections = await Promise.all(placed.map((entry) => renderSection(entry, page.sections, page.mode)));
  return { sections, sectionsCss: await sectionCss(sections.join(''), dictionary), mode: page.mode };
}
