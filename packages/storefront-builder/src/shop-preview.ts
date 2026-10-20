import {
  PREVIEW_AGENT,
  parseBuildInputs,
  renderPlacedSections,
  renderShopPage,
  type BuildInputs,
  type PageRender,
  type ShopTheme,
} from '@merfy/storefront-build';
import { resolveSectionSettings, type CurrentSection, type SectionRenderRequest } from '@merfy/storefront-sections';
import type { Dictionary } from '@merfy/tokens';
import { z } from 'zod';
import { instanceSchema, readVisibleSections } from './code';
import type { DrawAnswer } from './draw';
import { inlineAssets } from './inline-assets';
import { inlineFonts } from './preview-fonts';
import { readSnapshot } from './snapshot';
import { answer, isAnswer, jsonAnswer, standPreview, standShop, type PreviewDeps } from './stand-preview';

// Превью магазина новой темы (блок 1 «Секций и SDK», Р1, Р2). GET /preview?shop&page — главная: та же страница, что в
// сборке, в mode: preview; секции рисует процесс рендера превью магазина, скрипт превью — перед </body>; page=stand —
// стенд темы, как раньше (блок 8). POST /preview/section?shop с { instance } — один блок: { html, css }. GET
// /sections?shop — секции, которые магазин может поставить на страницу. Данные — заново на каждый запрос.
export interface PreviewShop {
  shopId: string;
  dictionary: Dictionary;
  // Файлы клиента темы — прямо в HTML: с адреса превью шлюза /_astro/… не загружаются.
  inline: (html: string) => string;
}

export interface ShopPreviewDeps {
  shop: (rawShop: string | null) => Promise<PreviewShop | DrawAnswer>;
  stand: (rawShop: string | null) => Promise<DrawAnswer>;
  inputs: (shopId: string) => Promise<{ inputs: BuildInputs; renders: ReadonlyMap<string, string> }>;
  theme: (id: string, version: string) => Promise<ShopTheme>;
  sections: (shopId: string) => Promise<ReadonlyMap<string, CurrentSection> | null>;
  render: (shopId: string, request: SectionRenderRequest) => Promise<string>;
  fonts: (css: string) => Promise<string>;
}

const HOME_PAGES: ReadonlySet<string> = new Set(['', '/', 'home']);
const FONTS_STYLE = /<style id="merfy-fonts">([\s\S]*?)<\/style>/;
const TEXT = {
  page: 'в превью есть главная (page=home) и стенд темы (page=stand)',
  block: 'нужно тело JSON { instance: { id, section, settings } }',
  section: (name: string) => `секции ${name} у магазина нет`,
  extensions: 'сервис расширений не ответил',
} as const;
const blockSchema = z.object({ instance: instanceSchema });

const isPreviewAnswer = (value: PreviewShop | DrawAnswer): value is DrawAnswer => 'status' in value;

// Зависимости превью из зависимостей сервиса сборки: тот же снимок, каталог тем и реестр, что у сборки и дорисовки.
export const shopPreviewDeps = (preview: PreviewDeps): ShopPreviewDeps => ({
  shop: async (rawShop) => {
    const found = await standShop(preview, rawShop);
    if (isAnswer(found)) return found;
    return {
      shopId: found.row.id,
      dictionary: found.theme.tokens.dictionary,
      inline: (html) => inlineAssets(html, found.theme.assets),
    };
  },
  stand: (rawShop) => standPreview(preview, rawShop),
  inputs: async (shopId) => {
    const snapshot = await readSnapshot(preview.snapshot, shopId);
    return { inputs: parseBuildInputs(snapshot.inputs), renders: snapshot.assets.renders };
  },
  theme: async (id, version) => (await preview.catalog.themeAt(id, version)).build,
  sections: (shopId) => readVisibleSections(preview.snapshot.code, shopId),
  render: (shopId, request) => preview.renderers.render(shopId, request),
  fonts: (css) => inlineFonts(css, preview.fonts),
});

const previewPage = (deps: ShopPreviewDeps, shopId: string, modules: ReadonlyMap<string, string>): PageRender => ({
  sections: { modules, render: (request) => deps.render(shopId, request) },
  mode: 'preview',
});

function beforeBodyEnd(html: string, tag: string): string {
  const at = html.lastIndexOf('</body>');
  return at === -1 ? `${html}${tag}` : `${html.slice(0, at)}${tag}${html.slice(at)}`;
}

// Шрифты превью — data:-адресами (блок 12): с адреса превью шлюза файлы /_merfy/fonts/… не загружаются.
async function inlinePageFonts(html: string, deps: ShopPreviewDeps): Promise<string> {
  const match = FONTS_STYLE.exec(html);
  if (match === null) return html;
  const css = await deps.fonts(match[1] ?? '');
  return html.replace(match[0], () => `<style id="merfy-fonts">${css}</style>`);
}

export async function shopPreview(deps: ShopPreviewDeps, url: URL): Promise<DrawAnswer> {
  const rawShop = url.searchParams.get('shop');
  const page = url.searchParams.get('page') ?? '';
  if (page === 'stand') return deps.stand(rawShop);
  if (!HOME_PAGES.has(page)) return answer(404, TEXT.page);
  const found = await deps.shop(rawShop);
  if (isPreviewAnswer(found)) return found;
  const { inputs, renders } = await deps.inputs(found.shopId);
  const theme = await deps.theme(inputs.theme.id, inputs.theme.version);
  const rendered = await renderShopPage(inputs, '/', theme, previewPage(deps, found.shopId, renders));
  const html = beforeBodyEnd(new TextDecoder().decode(rendered.file.content), `<script>${PREVIEW_AGENT}</script>`);
  return answer(200, found.inline(await inlinePageFonts(html, deps)));
}

function jsonOf(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

export async function sectionPreview(deps: ShopPreviewDeps, rawShop: string | null, body: string): Promise<DrawAnswer> {
  const found = await deps.shop(rawShop);
  if (isPreviewAnswer(found)) return found;
  const parsed = blockSchema.safeParse(jsonOf(body));
  if (!parsed.success) return jsonAnswer(400, { problems: [TEXT.block] });
  const { instance } = parsed.data;
  const sections = await deps.sections(found.shopId);
  if (sections === null) return jsonAnswer(502, { problems: [TEXT.extensions] });
  const current = sections.get(instance.section);
  if (current === undefined || current.render === null || current.renderHash === null)
    return jsonAnswer(404, { problems: [TEXT.section(instance.section)] });
  const settings = resolveSectionSettings(current.manifest.settings, instance.settings).values;
  const placed = { id: instance.id, name: instance.section, hash: current.renderHash, settings };
  const modules = new Map([[current.renderHash, current.render]]);
  const content = await renderPlacedSections([placed], found.dictionary, previewPage(deps, found.shopId, modules));
  return jsonAnswer(200, { html: content.sections[0] ?? '', css: content.sectionsCss });
}

export async function shopSections(deps: ShopPreviewDeps, rawShop: string | null): Promise<DrawAnswer> {
  const found = await deps.shop(rawShop);
  if (isPreviewAnswer(found)) return found;
  const sections = await deps.sections(found.shopId);
  if (sections === null) return jsonAnswer(502, { problems: [TEXT.extensions] });
  const list = [...sections.values()]
    .filter((section) => section.manifest.kind === 'section')
    .map((section) => ({ name: section.name, title: section.manifest.title, settings: section.manifest.settings }));
  return jsonAnswer(200, { sections: list });
}
