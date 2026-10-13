import { z } from 'zod';
import { RUSSIAN_ERRORS, TokenError, shapeProblems } from '../errors';
import type { JsonSchema } from '../types';

// Реестр шрифтов новых тем (design.md блока 12, «решил сам» 4): один JSON — packages/theme-contract/fonts/fonts.json.
// Его пишет только скрипт библиотеки (pnpm fonts:library) из пакетов Fontsource закреплённой версии, руками его не
// правят. Ключ — kebab-case, как у конструктора: тот же список из 50 шрифтов (Т12-1 А).

// Вид шрифта — как у Fontsource: без засечек, с засечками, акцидентный, рукописный, моноширинный.
export const FONT_CATEGORIES = ['sans-serif', 'serif', 'display', 'handwriting', 'monospace'] as const;
// Основа подогнанного запасного шрифта («решил сам» 12): Arial — для шрифтов без засечек, Times New Roman — с засечками.
export const METRIC_BASES = ['Arial', 'Times New Roman'] as const;

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FAMILY = /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const PACKAGE = /^@fontsource(?:-variable)?\/[a-z0-9-]+$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
// Файл на домене магазина: _fonts/<ключ>-<часть>-<начертание>.<16 знаков отпечатка>.woff2 («решил сам» 7).
const FONT_PATH = /^_fonts\/[a-z0-9-]+\.[0-9a-f]{16}\.woff2$/;
const RANGE = /^U\+[0-9A-F]{1,6}(?:-[0-9A-F]{1,6})?(?:,U\+[0-9A-F]{1,6}(?:-[0-9A-F]{1,6})?)*$/;
const PERCENT = /^\d+(?:\.\d+)?%$/;
// Начертание файла: wght — переменный файл со всей осью насыщенности, 100…900 — статичное начертание.
const FACE = /^(?:wght|[1-9]00)$/;

const fileSchema = z.strictObject({
  path: z.string().regex(FONT_PATH),
  hash: z.string().regex(HASH),
  bytes: z.int().positive(),
  // Файл в пакете Fontsource: по нему скрипт заливки качает байты и сверяет отпечаток.
  source: z.string().startsWith('files/'),
});

const subsetSchema = z.strictObject({
  'unicode-range': z.string().regex(RANGE),
  files: z.record(z.string().regex(FACE), fileSchema),
});

const metricsSchema = z.strictObject({
  base: z.enum(METRIC_BASES),
  'size-adjust': z.string().regex(PERCENT),
  'ascent-override': z.string().regex(PERCENT),
  'descent-override': z.string().regex(PERCENT),
  'line-gap-override': z.string().regex(PERCENT),
});

const fontSchema = z.strictObject({
  family: z.string().regex(FAMILY),
  category: z.enum(FONT_CATEGORIES),
  package: z.string().regex(PACKAGE),
  version: z.string().regex(SEMVER),
  // Оси переменного шрифта; null — статичный. Файлы берём по оси wght («решил сам» 9).
  axes: z.array(z.string().regex(/^[A-Za-z]{4}$/)).nullable(),
  weights: z.array(z.int().min(100).max(900)).min(1),
  // Есть ли кириллица — по самим файлам шрифта (cmap), а не по флагу из чужого списка (факт 18).
  cyrillic: z.boolean(),
  // Стек, который панель пишет в правку font-body и font-heading: шрифт, его подогнанный запасной, системный.
  stack: z.string().min(1),
  metrics: metricsSchema,
  license: z.string().min(1),
  'reserved-name': z.boolean(),
  subsets: z.record(z.string().regex(KEY), subsetSchema),
});

export const fontRegistrySchema = z.strictObject({
  v: z.literal(1),
  fonts: z.record(z.string().regex(KEY), fontSchema),
});

export type FontRegistry = z.infer<typeof fontRegistrySchema>;
export type FontEntry = z.infer<typeof fontSchema>;
export type FontFileEntry = z.infer<typeof fileSchema>;
export type FontCategory = FontEntry['category'];
export type MetricBase = FontEntry['metrics']['base'];

// Реестр из JSON (unknown): ошибка называет поле.
export function parseFontRegistry(raw: unknown): FontRegistry {
  const result = fontRegistrySchema.safeParse(raw, RUSSIAN_ERRORS);
  if (result.success) return result.data;
  throw new TokenError('fonts-invalid', shapeProblems(result.error, 'fonts'));
}

// Схема для generated/fonts.schema.json (pnpm generate): её видит редактор рядом с fonts.json.
export const fontRegistryJsonSchema = (): JsonSchema => ({ ...z.toJSONSchema(fontRegistrySchema) });
