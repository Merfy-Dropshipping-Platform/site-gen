import { z } from 'zod';
import type { JsonSchema } from '../types';
import type { TokenControl } from './types';

// Форма схемы панели (design.md блока 8, П1): что за ключи и какого типа. Смысл — токен есть в словаре, поле подходит
// виду токена, ползунок в пределах вида — проверяет panel.ts. Поле — строгий объект одного из двух видов: поле токена
// (token) или поле настройки (setting); оба ключа сразу или ни одного форма не пропустит.

export const TOKEN_CONTROLS: readonly TokenControl[] = [
  'color',
  'slider',
  'font',
  'weight',
  'segment',
  'align',
  'scheme',
];

const optionShape = z.object({ value: z.string(), label: z.string().min(1) }).strict();
const rangeShape = z.object({ min: z.number(), max: z.number(), step: z.number().positive() }).strict();
const visibleWhenShape = z.object({ setting: z.string(), equals: z.union([z.string(), z.boolean()]) }).strict();

const fieldBase = {
  id: z.string(),
  label: z.string().min(1),
  sublabel: z.string().min(1).optional(),
  section: z.string().min(1).optional(),
  row: z.string().min(1).optional(),
  visibleWhen: visibleWhenShape.optional(),
};

const tokenFieldShape = z
  .object({
    ...fieldBase,
    token: z.string(),
    control: z.enum(TOKEN_CONTROLS),
    range: rangeShape.optional(),
    options: z.array(optionShape).optional(),
  })
  .strict();

const settingSpecShape = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('image'), default: z.string(), maxBytes: z.int().positive() }).strict(),
  z.object({ kind: z.literal('url'), default: z.string(), placeholder: z.string().min(1).optional() }).strict(),
  z.object({ kind: z.literal('string'), default: z.string() }).strict(),
  z.object({ kind: z.literal('text'), default: z.string() }).strict(),
  z.object({ kind: z.literal('select'), default: z.string(), options: z.array(optionShape).min(2) }).strict(),
  z
    .object({
      kind: z.literal('toggle'),
      default: z.boolean(),
      labels: z.object({ on: z.string().min(1), off: z.string().min(1) }).strict(),
    })
    .strict(),
]);

const settingFieldShape = z
  .object({ ...fieldBase, setting: settingSpecShape, control: z.literal('segment').optional() })
  .strict();

const fieldShape = z.union([tokenFieldShape, settingFieldShape]);
const sidebarShape = z.object({ title: z.string().min(1), fields: z.array(fieldShape).min(1) }).strict();
const groupShape = z
  .object({
    id: z.string(),
    title: z.string().min(1),
    layout: z.literal('schemes').optional(),
    fields: z.array(fieldShape).min(1),
    sidebar: sidebarShape.optional(),
  })
  .strict();

export const panelShape = z
  .object({ $schema: z.string().optional(), v: z.literal(1), groups: z.array(groupShape).min(1) })
  .strict();

// Что тема пишет в theme.json → panel: какие поля панели ей не нужны (П-1 Г).
export const themePanelShape = z.object({ hidden: z.array(z.string()).optional() }).strict();

// JSON-схема файла схемы панели — для редактора; пишет её pnpm generate.
export const panelJsonSchema = (): JsonSchema => ({ ...z.toJSONSchema(panelShape) });
