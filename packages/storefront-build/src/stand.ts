import { buildStorefrontConfig, configTag } from '@merfy/storefront-config';
import {
  choiceAttributes,
  readSettingsEdits,
  readTokenEdits,
  resolveSettings,
  resolveTokens,
  tokensCss,
  type ParsedTheme,
  type PanelSchema,
  type TokenEdits,
} from '@merfy/tokens';
import type { StandPageLocals } from './locals';
import { PREVIEW_AGENT } from './preview-agent';
import { STAND_PAGE_PATH } from './renderer';

// Стенд темы в превью конструктора (design.md блока 8, П8-1 А и «Превью»): та же серверная сборка темы, что у
// сборщика, рисует /theme-stand в mode: preview с правками мерчанта из текущей ревизии — токенами (ключ tokens) и
// настройками не про вид (ключ settings). Данные берутся заново на каждый запрос. Стенду нужен только конфиг.

export interface StandInputs {
  site: { id: string; name: string; publicUrl: string | null };
  theme: { id: string; version: string };
  env: { apiUrl: string };
  // Ключи ревизии как есть: что не подошло теме, стенд печатает списком и рисует без этого (пустое не ломает).
  revision: { tokens: unknown; settings: unknown };
}

export interface StandTheme {
  tokens: ParsedTheme;
  // Схема панели платформы с полями, которые тема не скрыла (panelForTheme).
  panel: PanelSchema;
}

export interface PreviewTokens {
  css: string;
  attributes: Record<string, string>;
}

const STAND_TITLE = 'Стенд темы';
const SHOP_NAME_FALLBACK = 'Магазин';

// CSS токенов и атрибуты выборов по правкам — для стенда и для ручки POST …/preview/tokens.
export function previewTokens(theme: ParsedTheme, edits: TokenEdits): PreviewTokens {
  const resolved = resolveTokens(theme.dictionary, theme.tokens, edits);
  return {
    css: tokensCss(theme.dictionary, theme.tokens, edits),
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

function standConfig(inputs: StandInputs) {
  const publicUrl = shopUrl(inputs.site.publicUrl);
  return buildStorefrontConfig({
    site: { id: inputs.site.id, name: shopName(inputs.site.name, publicUrl), publicUrl },
    theme: inputs.theme,
    env: inputs.env,
    page: { id: 'theme-stand', path: STAND_PAGE_PATH },
    mode: 'preview',
  });
}

export function standLocals(inputs: StandInputs, theme: StandTheme): StandPageLocals {
  const config = standConfig(inputs);
  const name = config.shop.name;
  const tokens = readTokenEdits(theme.tokens.dictionary, theme.tokens.tokens, inputs.revision.tokens ?? {});
  const settings = readSettingsEdits(theme.panel, inputs.revision.settings ?? {});
  const { css, attributes } = previewTokens(theme.tokens, tokens.edits);
  return {
    head: { title: STAND_TITLE, configHtml: configTag(config), tokensCss: css, previewScript: PREVIEW_AGENT },
    attributes,
    settings: resolveSettings(theme.panel, settings.edits),
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
