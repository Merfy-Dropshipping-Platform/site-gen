import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { StandPageLocals } from '@merfy/storefront-build';
import { acceptSection, publishDrafts, readSectionFolder } from '@merfy/storefront-sections';
import { NO_MIGRATIONS, panelForTheme, parsePanel, parseTheme } from '@merfy/tokens';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import novaTheme from '../../../theme-nova/theme.json';
import panelJson from '../../../theme-contract/panel/theme-panel.json';
import { portOf, startDrawServer, type DrawDeps } from '../../src/draw';
import { createPreviewRenderers } from '../../src/preview-renderers';
import { createSlots } from '../../src/slots';
import type { PreviewTheme } from '../../src/stand-preview';
import { openHarness, type Harness } from './builder';
import { insertSite, resetBuilder, type SiteFields } from './stack';

// Порядок ключей tokens из section.json (блок 4а, PR #271): jsonb в storefront_section.manifest хранит ключи
// объекта отсортированными (по длине, потом по алфавиту), поэтому GET /sections отдавал конструктору поля секции
// не в том порядке, что в section.json. Приём сохраняет порядок имён, ответ собирает объект tokens в нём.
const TOKEN_ORDER = fileURLToPath(new URL('../../../storefront-sections/fixtures/styles/token-order', import.meta.url));
// Порядок как в section.json фикстры: длинные имена раньше коротких, не по алфавиту.
const KEYS = [
  'custom-swatch',
  'radius-custom-swatch',
  'weight-custom-label',
  'border-width-custom-swatch',
  'width-custom-card',
  'spacing-custom-gap',
  'text-custom-note',
];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function tokensOf(answer: unknown, name: string): Record<string, unknown> {
  if (!isRecord(answer) || !Array.isArray(answer.sections)) return {};
  const found = answer.sections.find(
    (item): item is { name: string; tokens: Record<string, unknown> } =>
      isRecord(item) && item.name === name && isRecord(item.tokens),
  );
  return found?.tokens ?? {};
}

let harness: Harness;
let server: Server;
let base: string;

const tokens = parseTheme(novaTheme.tokens);
const fakeStand = (locals: StandPageLocals): Promise<string> =>
  Promise.resolve(`<html><head></head><body>${locals.shop.name}</body></html>`);
const NOVA: PreviewTheme = {
  version: '0.0.3',
  themeTokens: novaTheme.tokens,
  tokens,
  panel: panelForTheme(parsePanel(panelJson, tokens.dictionary), undefined),
  renderStand: fakeStand,
  assets: new Map(),
  migrations: NO_MIGRATIONS,
};

async function serve(): Promise<void> {
  const deps: DrawDeps = {
    store: harness.store,
    snapshot: harness.deps.snapshot,
    themes: harness.deps.themes,
    catalog: harness.catalog,
    renderHash: 'test',
    slots: createSlots(1),
    timeoutMs: 3_000,
    log: harness.deps.log,
    preview: {
      db: harness.db,
      themes: new Map([['nova', NOVA]]),
      pins: harness.catalog,
      previewOf: () => Promise.resolve(NOVA),
      apiUrl: 'https://gateway.dev.merfy.ru/api',
      fonts: () => Promise.resolve(null),
      log: harness.deps.log,
      snapshot: harness.deps.snapshot,
      catalog: harness.catalog,
      renderers: createPreviewRenderers({ limit: 1 }),
    },
  };
  server = await startDrawServer(deps, 0);
  base = `http://127.0.0.1:${portOf(server)}`;
}

async function publishedShop(): Promise<SiteFields> {
  const site = await insertSite(harness.db);
  await acceptSection(
    { db: harness.db, store: harness.store },
    { author: 'shop', shopId: site.id },
    await readSectionFolder(TOKEN_ORDER),
  );
  await publishDrafts(harness.db, site.id);
  return site;
}

beforeAll(async () => {
  harness = openHarness();
  await resetBuilder(harness.db);
}, 120_000);

afterAll(async () => {
  await harness.close();
});
afterEach(() => new Promise<void>((resolve) => (server === undefined ? resolve() : server.close(() => resolve()))));

describe('порядок токенов секции на стеке', () => {
  it('GET /sections: ключи tokens — в порядке section.json', async () => {
    const site = await publishedShop();
    await serve();
    const answer: unknown = await (await fetch(`${base}/sections?shop=${site.id}`)).json();
    expect(Object.keys(tokensOf(answer, 'shop:token-order'))).toEqual(KEYS);
  });
});
