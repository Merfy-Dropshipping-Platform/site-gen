import { z } from 'zod';
import rebuildEventsJson from '../rebuild-events.json';
import { parseWith } from './schema';

// События пересборки магазина (design.md блока 3, 5.7; К3-4 А) — одно место, данными: rebuild-events.json.
// Читает сборщик новых тем (блок 6); нынешние темы пересобираются, как сейчас. Тест сверяет trigger с кодом site-gen.

const EVENT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Файл кода site-gen от корня репозитория: src/… или packages/….
const SOURCE_FILE = /^(src|packages)\/[\w./-]+\.ts$/;

// Источник в site-gen: файл и имя — тест находит имя в файле.
const codeTriggerSchema = z.strictObject({
  file: z.string().regex(SOURCE_FILE, { error: 'нужен путь к файлу .ts от корня site-gen' }),
  name: z.string().min(1),
});

// Источник в другом сервисе (product, billing, inventory): его код site-gen прочитать не может — сервис и описание,
// файл не сверяется.
const serviceTriggerSchema = z.strictObject({
  service: z.string().regex(EVENT_ID, { error: 'нужно имя сервиса: строчные латинские буквы, цифры и дефис' }),
  description: z.string().min(3),
});

const triggerSchema = z.union([codeTriggerSchema, serviceTriggerSchema], {
  error: 'trigger — либо file и name (код site-gen), либо service и description (другой сервис)',
});

// trigger: null — кода ещё нет, его напишет блок из status. У работающего события место в коде есть всегда.
const rebuildEventSchema = z
  .strictObject({
    id: z.string().regex(EVENT_ID, { error: 'нужны строчные латинские буквы, цифры и дефис' }),
    title: z.string().min(3),
    trigger: triggerSchema.nullable(),
    themes: z.enum(['all', 'new']),
    scope: z.enum(['store', 'dependent-pages', 'theme-stores']),
    delayMs: z.int().min(0),
    status: z.enum(['works', 'block-6', 'block-10']),
  })
  .refine((event) => event.status !== 'works' || event.trigger !== null, {
    path: ['trigger'],
    error: 'у работающего события нужен trigger: файл и имя в коде',
  });

const hasUniqueIds = (events: readonly { id: string }[]): boolean =>
  new Set(events.map((event) => event.id)).size === events.length;

export const rebuildEventsFileSchema = z.strictObject({
  $schema: z.string().optional(),
  events: z.array(rebuildEventSchema).min(1).refine(hasUniqueIds, { error: 'id событий повторяются' }),
});

export type RebuildEvent = z.infer<typeof rebuildEventSchema>;

export function parseRebuildEvents(raw: unknown): RebuildEvent[] {
  return parseWith(rebuildEventsFileSchema, raw, 'events-invalid').events;
}

export const rebuildEvents: readonly RebuildEvent[] = parseRebuildEvents(rebuildEventsJson);
