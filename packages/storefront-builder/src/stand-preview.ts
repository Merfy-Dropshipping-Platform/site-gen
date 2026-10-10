import {
  previewTokens,
  standLocals,
  type StandInputs,
  type StandPageLocals,
  type StandTheme,
} from '@merfy/storefront-build';
import { TokenError, parseTokenEdits } from '@merfy/tokens';
import { z } from 'zod';
import type { DrawAnswer } from './draw';
import { inlineAssets, type Assets } from './inline-assets';
import type { Log } from './log';
import type { Queryable } from './shop-state';
import { revisionKeySql } from './snapshot';

// Превью магазина новой темы (design.md блока 8, П8-1 А, «Превью»): сборщик рисует стенд темы тем же рисовальщиком, что
// и магазин, в mode: preview с правками мерчанта из текущей ревизии. Данные — заново на каждый запрос, без кэша.
// GET /preview?shop=<id> — HTML стенда; POST /preview/tokens?shop=<id> с { tokens } — { css, attributes } для слушателя
// превью; GET /theme-panel?theme=<id> — схема панели и токены темы для «Настроек темы» конструктора. sites отдаёт эти
// ответы конструктору по нынешним адресам превью и puck-config (src/storefront-preview).

export interface PreviewTheme extends StandTheme {
  version: string;
  // Токены темы как в theme.json: конструктор разбирает их своим @merfy/tokens (parseTheme).
  themeTokens: unknown;
  renderStand: (locals: StandPageLocals) => Promise<string>;
  assets: Assets;
}

export interface PreviewDeps {
  db: Queryable;
  themes: ReadonlyMap<string, PreviewTheme>;
  apiUrl: string;
  log: Log;
}

const STAND_SQL = `SELECT s.id, s.name, s.theme_id, s.public_url, ${revisionKeySql('tokens')} AS tokens,
  ${revisionKeySql('settings')} AS settings FROM site s LEFT JOIN site_revision r ON r.id = s.current_revision_id
  WHERE s.id = $1 AND s.deleted_at IS NULL`;

const standRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  theme_id: z.string().nullable(),
  public_url: z.string().nullable(),
  tokens: z.record(z.string(), z.json()),
  settings: z.record(z.string(), z.json()),
});
type StandRow = z.infer<typeof standRowSchema>;

const HTML = 'text/html; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';
const TEXT = {
  shop: 'нужен shop — id магазина',
  missing: 'магазина нет',
  theme: 'тема магазина — не новой архитектуры',
  body: 'нужно тело JSON { tokens }',
} as const;

// Превью всегда свежее: ни шлюз, ни браузер его не хранят.
const answer = (status: number, body: string, type = HTML): DrawAnswer => ({
  status,
  body,
  headers: { 'Content-Type': type, 'Cache-Control': 'no-store' },
});
const jsonAnswer = (status: number, value: unknown): DrawAnswer => answer(status, JSON.stringify(value), JSON_TYPE);

interface StandShop {
  row: StandRow;
  theme: PreviewTheme;
}

// Магазин и его тема новой архитектуры. Не нашли — готовый ответ: 400, 404.
async function standShop(deps: PreviewDeps, rawShop: string | null): Promise<StandShop | DrawAnswer> {
  const shop = z.uuid().safeParse(rawShop);
  if (!shop.success) return answer(400, TEXT.shop);
  const rows = (await deps.db.query(STAND_SQL, [shop.data])).rows.map((row) => standRowSchema.parse(row));
  if (rows.length === 0) return answer(404, TEXT.missing);
  const theme = deps.themes.get(rows[0].theme_id ?? '');
  return theme === undefined ? answer(404, TEXT.theme) : { row: rows[0], theme };
}

const isAnswer = (value: StandShop | DrawAnswer): value is DrawAnswer => 'status' in value;

const inputsOf = (deps: PreviewDeps, { row, theme }: StandShop): StandInputs => ({
  site: { id: row.id, name: row.name, publicUrl: row.public_url },
  theme: { id: row.theme_id ?? '', version: theme.version },
  env: { apiUrl: deps.apiUrl },
  revision: { tokens: row.tokens, settings: row.settings },
});

// HTML стенда с правками мерчанта; правки, что не подошли теме, — в журнал (и разделом на самом стенде).
export async function standPreview(deps: PreviewDeps, rawShop: string | null): Promise<DrawAnswer> {
  const found = await standShop(deps, rawShop);
  if (isAnswer(found)) return found;
  const locals = standLocals(inputsOf(deps, found), found.theme);
  if (locals.problems.length > 0)
    deps.log('preview-problems', { shopId: found.row.id, problems: locals.problems.join('; ') });
  return answer(200, inlineAssets(await found.theme.renderStand(locals), found.theme.assets));
}

const bodySchema = z.object({ tokens: z.unknown() });

function readBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

// CSS токенов и атрибуты выборов по правкам из конструктора. Правки не подошли теме — 400 со списком проблем.
export async function standTokens(deps: PreviewDeps, rawShop: string | null, body: string): Promise<DrawAnswer> {
  const found = await standShop(deps, rawShop);
  if (isAnswer(found)) return found;
  const parsed = bodySchema.safeParse(readBody(body));
  if (!parsed.success) return jsonAnswer(400, { problems: [TEXT.body] });
  try {
    return jsonAnswer(200, previewTokens(found.theme.tokens, parseTokenEdits(found.theme.tokens, parsed.data.tokens)));
  } catch (error) {
    if (error instanceof TokenError) return jsonAnswer(400, { problems: error.problems });
    throw error;
  }
}

// Ответ puck-config новой темы (design.md блока 8, «Как конструктор узнаёт новую тему»): секций нет — components и
// categories пустые; themePanel — схема панели с полями, которые тема не скрыла, и токены темы. По themePanel
// конструктор включает новую панель. Тема не новой архитектуры — 404.
export function themePanel(deps: PreviewDeps, themeId: string | null): DrawAnswer {
  const theme = deps.themes.get(themeId ?? '');
  if (themeId === null || theme === undefined) return answer(404, TEXT.theme);
  const panelTheme = { id: themeId, version: theme.version, tokens: theme.themeTokens };
  return jsonAnswer(200, { components: {}, categories: {}, themePanel: { panel: theme.panel, theme: panelTheme } });
}
