import { classesOf, platformDictionary } from '@merfy/tokens';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import configJson from '../scenarios/config-present.json';
import samplesJson from '../scenarios/samples-present.json';
import { collectPassport, type Collected } from '../src/browser/collect';
import { openPage } from '../src/browser/session';
import { checkScenario } from '../src/scenario/checks';
import { parseScenario } from '../src/scenario/schema';
import { TOKEN_SETS } from '../src/token-sets';
import { buildNova, readBuilt, STAND_HTML } from './support/nova';
import { serveFolder, type StaticServer } from './support/static-server';

// Стенд темы nova в настоящем браузере: сборка с флагом, страница из папки сборки, паспорт — как у команд.
// HTML стенда из папки сборки — для проверки «каждый токен на стенде» (design.md блока 9, «решил сам» 5).
let server: StaticServer;
let stand: Collected;
let standHtml: string;

// Классы страницы целиком, с вариантами: «md:grid-cols-2», «card-style-card:block».
const pageClasses = (html: string): string[] =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/)).filter((name) => name !== '');
// Утилита класса без вариантов: «card-style-card:bg-card» → «bg-card».
const utilityOf = (name: string): string => name.split(':').at(-1) ?? '';
// Класс токена есть на странице: утилита — целиком; вариант выбора («card-style-card:») — началом класса.
const shown = (classes: readonly string[], own: string): boolean =>
  own.endsWith(':') ? classes.some((name) => name.startsWith(own)) : classes.some((name) => utilityOf(name) === own);

beforeAll(async () => {
  const outDir = buildNova('1');
  standHtml = readBuilt(outDir, STAND_HTML);
  server = await serveFolder(outDir);
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
    expect(stand.passport.tokens['--radius-button']).toBe('0.75rem');
  });

  it('шрифт Onest загружен из библиотеки платформы: переменный файл — одно начертание 100–900', () => {
    // «Onest Fallback normal normal» — подогнанный запасной шрифт (local Arial), не файл библиотеки.
    const onest = stand.passport.fonts.filter((font) => /^Onest \d/.test(font));
    expect(onest).toEqual(['Onest 100 900 normal']);
  });

  it('каждый из 78 токенов словаря — класс хотя бы одного образца', () => {
    const classes = pageClasses(standHtml);
    const tokens = Object.entries(platformDictionary.tokens);
    const missing = tokens.filter(([name, def]) => !classesOf(name, def).some((own) => shown(classes, own)));
    expect(tokens).toHaveLength(78);
    expect(missing.map(([name]) => name)).toEqual([]);
  });

  it('сценарий config-present проходит целиком: конфиг магазина читается без ошибок', () => {
    const results = checkScenario(parseScenario(configJson), stand);
    expect(results.filter((result) => !result.ok)).toEqual([]);
  });

  it('на стенде только тег конфига и скрипт его раздела; глобалов, ключей хранилища и cookie нет', () => {
    expect(stand.passport.scripts.map((script) => [script.src, script.kind])).toEqual([
      ['#merfy-config', 'json'],
      ['inline:1', 'module'],
    ]);
    expect(stand.passport.globals).toEqual({});
    expect(stand.passport.storage).toEqual([]);
    expect(stand.passport.cookies).toEqual([]);
  });
});
