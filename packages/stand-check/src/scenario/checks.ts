import { TOKEN_SETS } from '../token-sets';
import type { Expectation, ExpectationResult, Passport, Scenario, ScenarioFacts, TokenSetName } from '../types';

type ExpectationByKind = { [E in Expectation as E['kind']]: E };
type ExpectationKind = keyof ExpectationByKind;
type CheckTable = {
  [K in ExpectationKind]: (expectation: ExpectationByKind[K], facts: ScenarioFacts) => ExpectationResult;
};

const LISTED_MAX = 5;
// Шрифт текста — первый в стеке токена --font-body (словарь @merfy/tokens, блок 1).
const BODY_FONT_TOKEN = '--font-body';

function listed(names: readonly string[]): string {
  const shown = names.slice(0, LISTED_MAX).join(', ');
  const rest = names.length - LISTED_MAX;
  return rest > 0 ? `${shown} и ещё ${rest}` : shown;
}

// Все ли токены набора есть на :root. Пустой набор не проходит: проверять нечего — значит, образцов ещё нет.
export function tokensPresent(
  set: TokenSetName,
  names: readonly string[],
  tokens: Readonly<Record<string, string>>,
): ExpectationResult {
  const kind = 'tokens-present';
  if (names.length === 0) return { kind, ok: false, detail: `набор ${set} пуст: образцов токенов на стенде ещё нет` };
  const missing = names.filter((name) => !Object.hasOwn(tokens, name));
  if (missing.length > 0) return { kind, ok: false, detail: `на :root не хватает: ${listed(missing)}` };
  return { kind, ok: true, detail: `на :root есть все токены набора ${set}: ${names.length}` };
}

function sectionsPresent(ids: readonly string[], sections: readonly string[]): ExpectationResult {
  const missing = ids.filter((id) => !sections.includes(id));
  const detail = missing.length === 0 ? `все разделы на месте: ${listed(ids)}` : `нет разделов: ${listed(missing)}`;
  return { kind: 'sections-present', ok: missing.length === 0, detail };
}

const firstFamily = (stack: string): string => stack.split(',')[0].trim().replaceAll(/["']/g, '');

// Файлы шрифтов новой темы — только с домена магазина, из /_fonts/ (design.md блока 12, «решил сам» 7 и 14); русские
// буквы приходят своей частью файла — её имя содержит «-cyrillic-».
const FONT_FILE = /\.(?:woff2?|ttf|otf)(?:[?#]|$)/;
const SHOP_FONTS = '/_fonts/';
const CYRILLIC_PART = '-cyrillic-';
type PageRequest = Passport['requests'][number];
const isFontFile = (request: PageRequest): boolean => FONT_FILE.test(request.url);
const isShopCyrillic = (request: PageRequest): boolean =>
  request.url.startsWith(SHOP_FONTS) && request.url.includes(CYRILLIC_PART) && request.status === 200;

function fontFileProblems(passport: Passport): string[] {
  const foreign = passport.requests.filter((request) => isFontFile(request) && !request.url.startsWith(SHOP_FONTS));
  const cyrillic = passport.requests.some(isShopCyrillic) ? [] : [`кириллической части шрифта с ${SHOP_FONTS} нет`];
  return [...foreign.map((request) => `шрифт не с ${SHOP_FONTS}: ${request.url}`), ...cyrillic];
}

function fontsLoaded(passport: Passport): ExpectationResult {
  const kind = 'fonts-loaded';
  const stack = new Map(Object.entries(passport.tokens)).get(BODY_FONT_TOKEN);
  if (stack === undefined) return { kind, ok: false, detail: `на :root нет ${BODY_FONT_TOKEN}: какой шрифт ждать?` };
  const family = firstFamily(stack);
  const loaded = listed(passport.fonts) || 'ни одного';
  if (!passport.fonts.some((font) => font.startsWith(`${family} `)))
    return { kind, ok: false, detail: `${family} не загружен; загружены: ${loaded}` };
  const problems = fontFileProblems(passport);
  const detail =
    problems.length === 0 ? `шрифт текста ${family} загружен с ${SHOP_FONTS}, кириллица есть` : listed(problems);
  return { kind, ok: problems.length === 0, detail };
}

function noErrors(errors: readonly string[]): ExpectationResult {
  const detail = errors.length === 0 ? 'ошибок нет' : `ошибок ${errors.length}: ${listed(errors)}`;
  return { kind: 'no-errors', ok: errors.length === 0, detail };
}

function noGlobals(globals: Readonly<Record<string, string>>): ExpectationResult {
  const names = Object.keys(globals);
  const detail = names.length === 0 ? 'глобалы __MERFY_*__ нет' : `глобалы: ${listed(names)}`;
  return { kind: 'no-globals', ok: names.length === 0, detail };
}

// Проверки итога — таблицей «вид проверки → функция» (design.md 5.5), без цепочек if.
const CHECKS: CheckTable = {
  'tokens-present': (expectation, facts) =>
    tokensPresent(expectation.set, TOKEN_SETS[expectation.set], facts.passport.tokens),
  'sections-present': (expectation, facts) => sectionsPresent(expectation.ids, facts.sections),
  'fonts-loaded': (_expectation, facts) => fontsLoaded(facts.passport),
  'no-errors': (_expectation, facts) => noErrors(facts.passport.errors),
  'no-globals': (_expectation, facts) => noGlobals(facts.passport.globals),
};

const runCheck = <K extends ExpectationKind>(
  kind: K,
  expectation: ExpectationByKind[K],
  facts: ScenarioFacts,
): ExpectationResult => CHECKS[kind](expectation, facts);

export function checkScenario(scenario: Scenario, facts: ScenarioFacts): ExpectationResult[] {
  return scenario.expect.map((expectation) => runCheck(expectation.kind, expectation, facts));
}
