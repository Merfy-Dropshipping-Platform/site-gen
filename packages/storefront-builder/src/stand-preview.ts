import {
  previewTokens,
  shopSectionTokensCss,
  standLocals,
  type StandInputs,
  type StandPageLocals,
  type StandTheme,
} from '@merfy/storefront-build';
import { TokenError, migrateTokenEdits, parseTokenEdits, type TokenMigrations } from '@merfy/tokens';
import type { ThemeCatalog, ThemePins } from './theme-catalog';
import { readVisibleSections } from './code';
import { z } from 'zod';
import { panelForConstructor } from './constructor-panel';
import type { DrawAnswer } from './draw';
import { inlineAssets, type Assets } from './inline-assets';
import { inlineFonts, type FontBytes } from './preview-fonts';
import type { Log } from './log';
import type { PreviewRenderers } from './preview-renderers';
import type { Queryable } from './shop-state';
import { revisionKeySql, type SnapshotDeps } from './snapshot';

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
  // Шаги перевода правок этой версии (блок 10): превью читает правки так же, как сборка.
  migrations: TokenMigrations;
}

export interface PreviewDeps {
  db: Queryable;
  // Темы образа: по ним — схема панели (/theme-panel).
  themes: ReadonlyMap<string, PreviewTheme>;
  // Версия магазина — из закрепления (блок 10): превью рисует ту же версию, что живая сборка.
  pins: ThemePins;
  previewOf: (themeId: string, version: string) => Promise<PreviewTheme>;
  apiUrl: string;
  // Байты файлов шрифтов для превью (блок 12): из хранилища по отпечатку.
  fonts: FontBytes;
  log: Log;
  // Снимок магазина и каталог тем — для превью главной (блок 1 «Секций и SDK»): те же, что у сборки и дорисовки.
  snapshot: SnapshotDeps;
  catalog: ThemeCatalog;
  // Процессы рендера секций превью — по магазину (preview-renderers.ts).
  renderers: PreviewRenderers;
}

const STAND_SQL = `SELECT s.id, s.name, s.theme_id, s.theme_version, s.public_url, ${revisionKeySql('tokens')} AS tokens,
  ${revisionKeySql('settings')} AS settings FROM site s LEFT JOIN site_revision r ON r.id = s.current_revision_id
  WHERE s.id = $1 AND s.deleted_at IS NULL`;

const standRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  theme_id: z.string().nullable(),
  theme_version: z.string().nullable(),
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
export const answer = (status: number, body: string, type = HTML): DrawAnswer => ({
  status,
  body,
  headers: { 'Content-Type': type, 'Cache-Control': 'no-store' },
});
export const jsonAnswer = (status: number, value: unknown): DrawAnswer =>
  answer(status, JSON.stringify(value), JSON_TYPE);

export interface StandShop {
  row: StandRow;
  theme: PreviewTheme;
}

// Магазин и его тема новой архитектуры. Не нашли — готовый ответ: 400, 404.
export async function standShop(deps: PreviewDeps, rawShop: string | null): Promise<StandShop | DrawAnswer> {
  const shop = z.uuid().safeParse(rawShop);
  if (!shop.success) return answer(400, TEXT.shop);
  const rows = (await deps.db.query(STAND_SQL, [shop.data])).rows.map((row) => standRowSchema.parse(row));
  if (rows.length === 0) return answer(404, TEXT.missing);
  const [row] = rows;
  if (row.theme_id === null || !deps.themes.has(row.theme_id)) return answer(404, TEXT.theme);
  const version = row.theme_version ?? (await deps.pins.released(row.theme_id));
  const theme = await deps.previewOf(row.theme_id, version);
  return { row: { ...row, tokens: migratedTokens(row.tokens, theme.migrations) }, theme };
}

const jsonObjectSchema = z.record(z.string(), z.json());

// Правки ревизии — в форме версии магазина (блок 10). Не подошло схеме JSON — как было: проблему покажет стенд.
function migratedTokens(tokens: StandRow['tokens'], migrations: TokenMigrations): StandRow['tokens'] {
  const parsed = jsonObjectSchema.safeParse(migrateTokenEdits(tokens, migrations));
  return parsed.success ? parsed.data : tokens;
}

export const isAnswer = (value: StandShop | DrawAnswer): value is DrawAnswer => 'status' in value;

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
  const standed = standLocals(inputsOf(deps, found), found.theme);
  const locals = {
    ...standed,
    head: { ...standed.head, fontsCss: await inlineFonts(standed.head.fontsCss, deps.fonts) },
  };
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

// Токены секций магазина для превью (блок 4, Р4-10): секции — как их читает /sections, правки — из того же тела.
async function previewSectionTokens(deps: PreviewDeps, shopId: string, rawTokens: unknown) {
  const sections = await readVisibleSections(deps.snapshot.code, shopId);
  if (sections === null) return shopSectionTokensCss([], rawTokens);
  const tokened = [...sections.values()].map((section) => ({
    name: section.name,
    tokens: section.manifest.tokens,
  }));
  return shopSectionTokensCss(tokened, rawTokens);
}

// CSS токенов и атрибуты выборов по правкам из конструктора. Правки не подошли теме — 400 со списком проблем.
export async function standTokens(deps: PreviewDeps, rawShop: string | null, body: string): Promise<DrawAnswer> {
  const found = await standShop(deps, rawShop);
  if (isAnswer(found)) return found;
  const parsed = bodySchema.safeParse(readBody(body));
  if (!parsed.success) return jsonAnswer(400, { problems: [TEXT.body] });
  try {
    const edits = parseTokenEdits(found.theme.tokens, migrateTokenEdits(parsed.data.tokens, found.theme.migrations));
    const answer = previewTokens(found.theme.tokens, edits);
    const sections = await previewSectionTokens(deps, found.row.id, parsed.data.tokens);
    if (sections.problems.length > 0) return jsonAnswer(400, { problems: sections.problems });
    const css = [answer.css, sections.css].filter((part) => part !== '').join('\n');
    return jsonAnswer(200, { ...answer, css, fontsCss: await inlineFonts(answer.fontsCss, deps.fonts) });
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
  // Без пометки сквозных: конструктор разбирает панель строгой формой @merfy/tokens 0.1.0 (constructor-panel.ts).
  const panel = panelForConstructor(theme.panel);
  return jsonAnswer(200, { components: {}, categories: {}, themePanel: { panel, theme: panelTheme } });
}
