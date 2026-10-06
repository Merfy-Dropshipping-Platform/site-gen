import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import samplesJson from '../scenarios/samples-present.json';
import { collectPassport, type Collected } from '../src/browser/collect';
import { openPage } from '../src/browser/session';
import { checkScenario } from '../src/scenario/checks';
import { parseScenario } from '../src/scenario/schema';
import { TOKEN_SETS } from '../src/token-sets';
import { buildNova } from './support/nova';
import { serveFolder, type StaticServer } from './support/static-server';

// Стенд темы nova в настоящем браузере: сборка с флагом, страница из папки сборки, паспорт — как у команд.
let server: StaticServer;
let stand: Collected;

beforeAll(async () => {
  server = await serveFolder(buildNova('1'));
  stand = await openPage(`${server.url}/theme-stand/index.html`, { sabotage: [] }, (page) =>
    collectPassport(page, 'local'),
  );
});

afterAll(async () => {
  await server.close();
});

describe('стенд темы nova', () => {
  it('сценарий samples-present проходит целиком', () => {
    const results = checkScenario(parseScenario(samplesJson), stand);
    expect(results.filter((result) => !result.ok)).toEqual([]);
  });

  it('на :root все 71 переменная набора base — значения из theme.json', () => {
    expect(Object.keys(stand.passport.tokens)).toHaveLength(TOKEN_SETS.base.length);
    expect(stand.passport.tokens['--background']).toBe('#ffffff');
    expect(stand.passport.tokens['--radius-button']).toBe('0.5rem');
  });

  it('шрифт Manrope загружен в двух начертаниях — текст и заголовки', () => {
    expect(stand.passport.fonts).toEqual(['Manrope 400 normal', 'Manrope 600 normal']);
  });

  it('на стенде нет скриптов, глобалов, ключей хранилища и cookie', () => {
    expect(stand.passport.scripts).toEqual([]);
    expect(stand.passport.globals).toEqual({});
    expect(stand.passport.storage).toEqual([]);
    expect(stand.passport.cookies).toEqual([]);
  });
});
