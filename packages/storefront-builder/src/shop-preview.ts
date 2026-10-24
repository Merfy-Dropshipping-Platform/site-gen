import {
  NOT_FOUND_PAGE_ID,
  NOT_FOUND_ROUTE,
  PREVIEW_AGENT,
  PREVIEW_SECTIONS_AGENT,
  pageInfoById,
  pagePropsOf,
  parseBuildInputs,
  renderPlacedSections,
  renderShopPage,
  type BuildInputs,
  type PageProps,
  type PageRender,
  type SettingValues,
  type ShopTheme,
} from '@merfy/storefront-build';
import {
  propsUsesOf,
  resolveSectionBlocks,
  resolveSectionSettings,
  revisionMenusSchema,
  sectionMenus,
  type CurrentSection,
  type RevisionMenu,
  type SectionRenderRequest,
  settingFieldsOf,
  wrapperIdsOf,
  WRAPPER_FIELDS,
} from '@merfy/storefront-sections';
import type { Dictionary } from '@merfy/tokens';
import { z } from 'zod';
import { instanceSchema, readVisibleSections, wrapperOf, type SectionInstance } from './code';
import type { DrawAnswer } from './draw';
import { inlineAssets } from './inline-assets';
import {
  previewScriptOf,
  previewTags,
  scriptHashOf,
  scriptPlacedOf,
  type PreviewInputs,
  type PreviewShell,
} from './preview-code';
import { inlineFonts } from './preview-fonts';
import { withPreviewPolicy } from './preview-policy';
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
  inputs: (shopId: string) => Promise<PreviewInputs>;
  theme: (id: string, version: string) => Promise<ShopTheme>;
  sections: (shopId: string) => Promise<ReadonlyMap<string, CurrentSection> | null>;
  render: (shopId: string, request: SectionRenderRequest) => Promise<string>;
  fonts: (css: string) => Promise<string>;
  // Сборка ядра сервиса (блок 5, часть 5г): её части — uses кода секции до части 5в; нет — uses пустой.
  shell?: PreviewShell;
}

const HOME_PAGES: ReadonlySet<string> = new Set(['', '/', 'home']);
const FONTS_STYLE = /<style id="merfy-fonts">([\s\S]*?)<\/style>/;
const TEXT = {
  page: 'в превью есть главная (page=home), страница 404 (page=not-found), свои страницы (page=<id страницы>) и стенд темы (page=stand)',
  block: 'нужно тело JSON { instance: { id, section, settings }, menus?, theme?, page? }',
  section: (name: string) => `секции ${name} у магазина нет`,
  extensions: 'сервис расширений не ответил',
} as const;
// Часть 4 (Р1-4-11): меню ревизии и правки настроек темы — несохранённые, из конструктора.
const blockSchema = z.object({
  instance: instanceSchema,
  menus: revisionMenusSchema.optional(),
  theme: z.record(z.string(), z.unknown()).optional(),
  // Часть 7а блока 7: id страницы, на которой стоит блок; нет или неизвестный — главная.
  page: z.string().optional(),
});

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
    return { inputs: parseBuildInputs(snapshot.inputs), renders: snapshot.assets.renders, assets: snapshot.assets };
  },
  theme: async (id, version) => (await preview.catalog.themeAt(id, version)).build,
  sections: (shopId) => readVisibleSections(preview.snapshot.code, shopId),
  render: (shopId, request) => preview.renderers.render(shopId, request),
  fonts: (css) => inlineFonts(css, preview.fonts),
  shell: preview.snapshot.code.shell,
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

// Предзагрузка файла шрифта в превью не нужна и ломает документ: байты уже data:-адресами в CSS (inlinePageFonts),
// а /_fonts/ на адресе превью не раздаётся — тег даёт ошибку загрузки (блок 2, часть 2б).
const LINK_TAG = /<link\b[^>]*>/gi;
const LINK_ATTRIBUTE = /([a-z]+)(?:="([^"]*)")?/gi;
const FONT_PRELOAD_PREFIX = '/_fonts/';

const attributeOf = (tag: string, name: string): string | undefined => {
  for (const match of tag.matchAll(LINK_ATTRIBUTE)) {
    if ((match[1] ?? '').toLowerCase() === name) return match[2] ?? '';
  }
  return undefined;
};

const isFontPreload = (tag: string): boolean => {
  if (attributeOf(tag, 'rel') !== 'preload') return false;
  return (attributeOf(tag, 'href') ?? '').startsWith(FONT_PRELOAD_PREFIX);
};

function withoutFontPreloads(html: string): string {
  return html.replace(LINK_TAG, (tag) => (isFontPreload(tag) ? '' : tag));
}

// Адрес страницы превью: главная, страница 404 (часть 7а; всегда темой — это поверхность правки) или своя страница.
function previewPathOf(inputs: BuildInputs, page: string): string | undefined {
  if (HOME_PAGES.has(page)) return '/';
  if (page === NOT_FOUND_PAGE_ID) return NOT_FOUND_ROUTE.path;
  return inputs.revision.pages?.find((candidate) => candidate.id === page)?.slug;
}

export async function shopPreview(deps: ShopPreviewDeps, url: URL): Promise<DrawAnswer> {
  const rawShop = url.searchParams.get('shop');
  const page = url.searchParams.get('page') ?? '';
  if (page === 'stand') return deps.stand(rawShop);
  const found = await deps.shop(rawShop);
  if (isPreviewAnswer(found)) return found;
  const { inputs, renders, assets } = await deps.inputs(found.shopId);
  // Главная или своя страница по id (часть 4, Р1-4-9): адрес — из ревизии; другой страницы в превью нет.
  const path = previewPathOf(inputs, page);
  if (path === undefined) return answer(404, TEXT.page);
  const theme = await deps.theme(inputs.theme.id, inputs.theme.version);
  const rendered = await renderShopPage(inputs, path, theme, previewPage(deps, found.shopId, renders));
  // Оба скрипта превью (1а-13): слушатель токенов и скрипт секций — select-block, update-block, reconcile. За ними —
  // код страницы (блок 5, часть 5г): JSON-тег бандла превью и скрипт превью; нет снимка кода — без них.
  const agents = `<script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script>`;
  const code = await previewTags(inputs, assets);
  const html = beforeBodyEnd(new TextDecoder().decode(rendered.file.content), `${agents}${code}`);
  return answer(200, withPreviewPolicy(found.inline(withoutFontPreloads(await inlinePageFonts(html, deps)))));
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
  const { instance, menus, theme, page } = parsed.data;
  const sections = await deps.sections(found.shopId);
  if (sections === null) return jsonAnswer(502, { problems: [TEXT.extensions] });
  const current = sections.get(instance.section);
  if (current === undefined || current.render === null || current.renderHash === null)
    return jsonAnswer(404, { problems: [TEXT.section(instance.section)] });
  const settings = resolveSectionSettings(settingFieldsOf(current.manifest.settings), instance.settings).values;
  // Блоки (часть 3, Р55): показанные, со значениями; у секции без blocks — без ключа.
  const blocks =
    current.manifest.blocks === undefined
      ? {}
      : { blocks: resolveSectionBlocks(current.manifest, instance.blocks).blocks };
  // Часть 4 (Р1-4-11): деревья меню по значениям настроек; uses — только если объявлен.
  const placed = previewPlaced(instance, current, settings, blocks, menus ?? [], current.renderHash);
  // page — у каждой секции (часть 7а): без page и без uses пропсы не читаются, страница — главная.
  const needsProps = propsUsesOf(current.manifest).length > 0 || page !== undefined;
  const props = needsProps ? await previewProps(deps, found.shopId, theme, page) : undefined;
  const modules = new Map([[current.renderHash, current.render]]);
  const content = await renderPlacedSections([placed], found.dictionary, {
    ...previewPage(deps, found.shopId, modules),
    props,
  });
  // Код секции (блок 5, часть 5г): скрипт секций превью передаёт его скрипту превью; нет кода — null.
  const script = previewScriptOf(current, deps.shell ?? null);
  return jsonAnswer(200, { html: content.sections[0] ?? '', css: content.sectionsCss, script });
}

// Экземпляр превью: блоки, деревья меню и uses — только те ключи, что у секции есть.
function previewPlaced(
  instance: SectionInstance,
  current: CurrentSection,
  settings: SettingValues,
  blocks: Record<string, unknown>,
  menus: readonly RevisionMenu[],
  hash: string,
) {
  const trees = sectionMenus(settingFieldsOf(current.manifest.settings), settings, menus);
  return {
    id: instance.id,
    name: instance.section,
    hash,
    settings,
    ...wrapperOf(instance, current),
    ...blocks,
    ...(Object.keys(trees).length === 0 ? {} : { menus: trees }),
    ...(current.manifest.uses === undefined ? {} : { uses: propsUsesOf(current.manifest) }),
    ...scriptPlacedOf(current),
  };
}

// Настройки темы и данные магазина для превью одного блока (часть 4, Р1-4-11): themeEdits нет — правки из ревизии.
async function previewProps(
  deps: ShopPreviewDeps,
  shopId: string,
  themeEdits: unknown,
  pageId = 'home',
): Promise<PageProps> {
  const { inputs } = await deps.inputs(shopId);
  const theme = await deps.theme(inputs.theme.id, inputs.theme.version);
  const props = pagePropsOf(inputs, theme, themeEdits ?? inputs.revision.settings ?? {});
  return { ...props, page: pageInfoById(inputs, pageId) };
}

export async function shopSections(deps: ShopPreviewDeps, rawShop: string | null): Promise<DrawAnswer> {
  const found = await deps.shop(rawShop);
  if (isPreviewAnswer(found)) return found;
  const sections = await deps.sections(found.shopId);
  if (sections === null) return jsonAnswer(502, { problems: [TEXT.extensions] });
  const list = [...sections.values()]
    .filter((section) => section.manifest.kind === 'section')
    .map((section) => ({
      name: section.name,
      title: section.manifest.title,
      settings: section.manifest.settings,
      // Часть 5 (Р1-5-5): список общих настроек секции — всегда, чтобы конструктору не нужно знать умолчание.
      wrapper: wrapperIdsOf(section.manifest),
      // Свои токены секции (блок 4, Р4-9) — записи из section.json; нет — {}.
      tokens: section.manifest.tokens ?? {},
      // Типы блоков и блоки новой секции (часть 3) — только у секций с blocks.
      ...(section.manifest.blocks === undefined
        ? {}
        : { blocks: section.manifest.blocks, defaultBlocks: section.manifest.defaultBlocks ?? [] }),
      ...placeKeys(section.manifest),
      // Хеш кода секции (блок 5, часть 5г): по нему конструктор видит новую версию кода.
      ...scriptHashOf(section),
    }));
  return jsonAnswer(200, { sections: list, wrapper: WRAPPER_FIELDS });
}

// Место секции (часть 4, Р1-4-2): groups, limit, removable, uses, newPage — только объявленные в section.json.
const PLACE_KEYS = ['groups', 'limit', 'removable', 'uses', 'newPage'] as const;

function placeKeys(manifest: CurrentSection['manifest']): Record<string, unknown> {
  return Object.fromEntries(PLACE_KEYS.flatMap((key) => (manifest[key] === undefined ? [] : [[key, manifest[key]]])));
}
