import { buildStorefrontConfig, configTag } from '@merfy/storefront-config';
import {
  choiceAttributes,
  readSettingsEdits,
  readTokenEdits,
  resolveSettings,
  resolveTokens,
  type ParsedTheme,
  type PanelSchema,
  type TokenEdits,
} from '@merfy/tokens';
import { sha256 } from './canonical';
import { entityKey } from './entities';
import type { BuildInputs } from './inputs';
import { themeFonts, themeTokensCss } from './fonts';
import type { StandPageLocals } from './locals';
import { checkPageRow } from './manifest';
import type { RenderedPage } from './page';
import { PREVIEW_AGENT } from './preview-agent';
import { STAND_PAGE_PATH } from './renderer';

// Стенд темы в превью конструктора (design.md блока 8, П8-1 А и «Превью»): та же серверная сборка темы, что у
// сборщика, рисует /theme-stand в mode: preview с правками мерчанта из текущей ревизии — токенами (ключ tokens) и
// настройками не про вид (ключ settings). Данные берутся заново на каждый запрос. Стенду нужен только конфиг.
// В сборке магазина (шаг 7 блока 9: эталон стенда на dev по адресу магазина) тот же стенд рисуется из опубликованной
// ревизии в виде live — без слушателя превью.

export interface StandInputs {
  site: { id: string; name: string; publicUrl: string | null };
  theme: { id: string; version: string };
  // Адрес сборщика аналитики нужен виду live: опубликованная страница без него не соберётся (блок 11).
  env: { apiUrl: string; analyticsUrl?: string };
  // Ключи ревизии как есть: что не подошло теме, стенд печатает списком и рисует без этого (пустое не ломает).
  revision: { tokens: unknown; settings: unknown };
}

export interface StandTheme {
  tokens: ParsedTheme;
  // Схема панели платформы с полями, которые тема не скрыла (panelForTheme).
  panel: PanelSchema;
}

// Тема со стендом для сборки магазина: её кладёт в ThemeBuild.stand сборщик с включённой страницей стенда.
export interface StandBuild extends StandTheme {
  renderStand: (locals: StandPageLocals) => Promise<string>;
}

// Где стенд: превью конструктора — черновик и слушатель превью; сборка магазина — опубликованное, режим live.
export type StandView = 'preview' | 'live';

const STAND_FILE = 'theme-stand.html';

export interface PreviewTokens {
  css: string;
  // CSS шрифтов (блок 12): правка шрифта в панели меняет и его — слушатель превью подменяет <style id="merfy-fonts">.
  fontsCss: string;
  attributes: Record<string, string>;
}

const STAND_TITLE = 'Стенд темы';
const SHOP_NAME_FALLBACK = 'Магазин';

// CSS токенов и атрибуты выборов по правкам — для стенда и для ручки POST …/preview/tokens.
export function previewTokens(theme: ParsedTheme, edits: TokenEdits): PreviewTokens {
  const resolved = resolveTokens(theme.dictionary, theme.tokens, edits);
  return {
    css: themeTokensCss(theme, edits),
    fontsCss: themeFonts(theme, edits).css,
    attributes: choiceAttributes(theme.dictionary, resolved),
  };
}

// Адрес магазина: public_url бывает без схемы («abc.merfy.ru»), магазин отдаётся по https. Не публиковали — null.
function shopUrl(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  const withScheme = publicUrl.includes('://') ? publicUrl : `https://${publicUrl}`;
  return `https://${new URL(withScheme).host}`;
}

// Имя магазина: мерчант его стёр — адрес магазина, нет и адреса — «Магазин». Пустое поле стенд не ломает.
const shopName = (name: string, url: string | null): string =>
  name.trim() || (url === null ? '' : new URL(url).host) || SHOP_NAME_FALLBACK;

// settings — значения настроек стенда (locals.settings): сквозные из них — в theme.settings конфига (часть 9б).
function standConfig(inputs: StandInputs, mode: StandView, settings: Readonly<Record<string, unknown>>) {
  const publicUrl = shopUrl(inputs.site.publicUrl);
  return buildStorefrontConfig({
    site: { id: inputs.site.id, name: shopName(inputs.site.name, publicUrl), publicUrl },
    theme: { ...inputs.theme, settings },
    env: inputs.env,
    page: { id: 'theme-stand', path: STAND_PAGE_PATH },
    mode,
    analytics: inputs.env.analyticsUrl === undefined ? null : { url: inputs.env.analyticsUrl, counters: [] },
  });
}

export function standLocals(inputs: StandInputs, theme: StandTheme, view: StandView = 'preview'): StandPageLocals {
  const settings = readSettingsEdits(theme.panel, inputs.revision.settings ?? {});
  const values = resolveSettings(theme.panel, settings.edits);
  const config = standConfig(inputs, view, values);
  const name = config.shop.name;
  const tokens = readTokenEdits(theme.tokens.dictionary, theme.tokens.tokens, inputs.revision.tokens ?? {});
  const { css, fontsCss, attributes } = previewTokens(theme.tokens, tokens.edits);
  const previewScript = view === 'preview' ? PREVIEW_AGENT : '';
  return {
    head: { title: STAND_TITLE, configHtml: configTag(config), fontsCss, tokensCss: css, previewScript },
    attributes,
    settings: values,
    shop: { name },
    schemes: Object.keys(theme.tokens.tokens.schemes),
    config: {
      'shop.name': config.shop.name,
      mode: config.mode,
      'theme.version': config.theme.version,
      'page.id': config.page.id,
    },
    problems: [...tokens.problems.map((problem) => `tokens.${problem}`), ...settings.problems],
  };
}

// Входы стенда из входов сборки. Правки настроек — из опубликованной ревизии, как у страниц магазина (блок 9 «Секций и
// SDK», часть 9б): сквозные из них стенд отдаёт в theme.settings конфига.
const standInputsOf = (inputs: BuildInputs): StandInputs => ({
  site: { id: inputs.site.id, name: inputs.site.name, publicUrl: inputs.site.publicUrl },
  theme: { id: inputs.theme.id, version: inputs.theme.version },
  env: inputs.env,
  revision: { tokens: inputs.revision.tokens, settings: inputs.revision.settings ?? {} },
});

// Страница стенда в сборке — страница сайта, как главная: её перерисовывает та же правка магазина.
export async function renderStandPage(inputs: BuildInputs, stand: StandBuild): Promise<RenderedPage> {
  const html = await stand.renderStand(standLocals(standInputsOf(inputs), stand, 'live'));
  const content = Buffer.from(html, 'utf8');
  const entity = { type: 'site' as const, id: inputs.site.id };
  const row = checkPageRow({
    path: STAND_PAGE_PATH,
    file: STAND_FILE,
    hash: sha256(content),
    entity,
    deps: [entityKey(entity.type, entity.id)],
    dataUpdatedAt: inputs.site.updatedAt,
  });
  return { row, file: { path: STAND_FILE, content } };
}
