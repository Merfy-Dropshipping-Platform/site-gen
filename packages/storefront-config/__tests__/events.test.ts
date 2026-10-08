import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import rebuildEventsJson from '../rebuild-events.json';
import { StorefrontConfigError } from '../src/errors';
import { parseRebuildEvents, rebuildEvents } from '../src/events';
import { generatedFiles } from '../src/generated-files';

// trigger называет файл от корня site-gen; тест читает этот файл и ищет в нём имя.
const SITE_GEN_ROOT = new URL('../../../', import.meta.url);
const sourceOf = (file: string): string => readFileSync(new URL(file, SITE_GEN_ROOT), 'utf8');

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Имя ищется целиком: sites.publish не найдётся в sites.publish_draft, DEBOUNCE_MS — в FRAGMENT_PATCH_DEBOUNCE_MS.
const mentions = (source: string, name: string): boolean =>
  new RegExp(`(?<![\\w.-])${escapeRegExp(name)}(?![\\w.-])`).test(source);

// Число из объявления константы: «DEBOUNCE_MS = 45_000;» → 45000.
function constantIn(source: string, name: string): number {
  const match = new RegExp(`\\b${name} = ([\\d_]+);`).exec(source);
  if (match === null) throw new Error(`в файле нет константы ${name}`);
  return Number(match[1].replaceAll('_', ''));
}

// Откуда задержка события сейчас: константа в коде site-gen.
const DELAY_SOURCES: [string, string, string][] = [
  ['product-change', 'src/listeners/product-update.listener.ts', 'DEBOUNCE_MS'],
  ['branding-change', 'src/sites.service.ts', 'BRANDING_REPUBLISH_DEBOUNCE_MS'],
];

const delayOf = (id: string): number | undefined => rebuildEvents.find((event) => event.id === id)?.delayMs;

function eventsError(raw: unknown): StorefrontConfigError {
  try {
    parseRebuildEvents(raw);
  } catch (error) {
    if (error instanceof StorefrontConfigError) return error;
    throw error;
  }
  throw new Error('список событий прошёл схему, а не должен');
}

const [firstEvent] = rebuildEventsJson.events;
// Источник в site-gen: [id, имя, файл] — тест находит имя в файле. У theme-release кода ещё нет — его пишет блок 10.
const inSiteGen = rebuildEvents.flatMap((event): [string, string, string][] => {
  const trigger = event.trigger;
  return trigger !== null && 'file' in trigger ? [[event.id, trigger.name, trigger.file]] : [];
});
// Источник в другом сервисе: [id, сервис]. Его код site-gen прочитать не может — файл не сверяется.
const inOtherServices = rebuildEvents.flatMap((event): [string, string][] => {
  const trigger = event.trigger;
  return trigger !== null && 'service' in trigger ? [[event.id, trigger.service]] : [];
});

describe('события пересборки (design.md блока 3, 5.7)', () => {
  it('тринадцать событий: темы, что пересобрать и статус', () => {
    expect(rebuildEvents.map((event) => [event.id, event.themes, event.scope, event.status])).toEqual([
      ['merchant-publish', 'all', 'store', 'works'],
      ['product-change', 'all', 'dependent-pages', 'works'],
      ['theme-change', 'all', 'store', 'works'],
      ['branding-change', 'all', 'store', 'works'],
      ['theme-release', 'new', 'theme-stores', 'block-10'],
      ['domain-change', 'new', 'store', 'works'],
      ['shop-name-change', 'new', 'store', 'works'],
      ['policy-change', 'new', 'store', 'works'],
      ['contacts-change', 'new', 'store', 'works'],
      ['publication-change', 'new', 'dependent-pages', 'works'],
      ['collection-change', 'new', 'dependent-pages', 'with-sections'],
      ['payment-settings-change', 'new', 'store', 'with-sections'],
      ['stock-change', 'new', 'dependent-pages', 'with-sections'],
    ]);
  });

  it.each(inSiteGen)('%s: имя %s находится в %s', (_id, name, file) => {
    expect(mentions(sourceOf(file), name)).toBe(true);
  });

  it('источники в других сервисах — сервис и описание, файл не сверяется', () => {
    expect(inOtherServices).toEqual([
      ['collection-change', 'product'],
      ['payment-settings-change', 'billing'],
      ['stock-change', 'inventory'],
    ]);
  });

  it.each(DELAY_SOURCES)('%s: delayMs равен константе в %s → %s', (id, file, name) => {
    expect(delayOf(id)).toBe(constantIn(sourceOf(file), name));
  });
});

describe('схема списка событий', () => {
  it('scope не из трёх значений — ошибка с путём поля', () => {
    const error = eventsError({ events: [{ ...firstEvent, scope: 'everything' }] });
    expect(error.code).toBe('events-invalid');
    expect(error.path).toBe('events.0.scope');
  });

  it('у работающего события trigger обязателен', () => {
    const error = eventsError({ events: [{ ...firstEvent, trigger: null }] });
    expect(error.message).toBe('events.0.trigger: у работающего события нужен trigger: файл и имя в коде');
  });

  it('id событий не повторяются', () => {
    expect(eventsError({ events: [firstEvent, firstEvent] }).message).toBe('events: id событий повторяются');
  });

  it('trigger — либо файл и имя, либо сервис и описание; смесь — ошибка с путём поля', () => {
    const mixed = { file: 'src/sites.service.ts', name: 'switchDomain', service: 'product' };
    const error = eventsError({ events: [{ ...firstEvent, trigger: mixed }] });
    expect(error.path).toBe('events.0.trigger');
    expect(error.message).toContain('либо file и name');
  });

  it('JSON Schema: scope — три значения, лишние ключи запрещены', () => {
    const schema: unknown = JSON.parse(generatedFiles()['generated/rebuild-events.schema.json']);
    expect(schema).toMatchObject({
      additionalProperties: false,
      properties: {
        events: {
          items: {
            additionalProperties: false,
            properties: { scope: { enum: ['store', 'dependent-pages', 'theme-stores'] } },
          },
        },
      },
    });
  });
});
