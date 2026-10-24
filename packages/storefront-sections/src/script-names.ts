import { ACTIONS, ACTION_EVENTS, ACTION_NAMES, isActionName } from '@merfy/shell/actions';
import { EVENT_NAMES } from '@merfy/shell/events';
import { TEMPLATE_FILE, type SectionManifest } from './format';
import { levenshteinOf } from './name-check';
import { problem, type SectionProblem } from './problems';
import type { ScriptFacts } from './script-facts';
import type { MarkupName, TemplateMarkup } from './template-markup';

// Сверка имён при сохранении (11д А; design.md блока 5, раздел 3.9) — по разметке шаблона, фактам скрипта и section.json.
// Строка таблицы NAME_RULES — один код ошибки: event-unknown — имя в ctx.listen('…') по каталогу событий SDK (блок 9,
// часть 9а, @merfy/shell/events) или событие другой секции; action-unknown — data-action по таблице действий SDK
// (@merfy/shell/actions: имя и есть ли у действия разметка) и по actions секции, событие перед двоеточием — по списку
// ACTION_EVENTS ядра. Новый код — новая строка таблицы и код в PROBLEM_CODES (problems.ts); входные данные — NameInput.
// Блок 9 (часть 9б) добавляет так theme-setting-unknown по facts.reads (путь ['theme', '<имя>']).
export interface NameInput {
  manifest: SectionManifest;
  markup: TemplateMarkup;
  // null — у секции нет скрипта.
  facts: ScriptFacts | null;
  // script.ts или script.js; null — скрипта нет.
  scriptEntry: string | null;
}

export type NameRule = (input: NameInput) => SectionProblem[];

// Событие другой секции: <автор>:<секция>:<событие> — так его отправляет ctx.emit (раздел 3.2).
const SECTION_EVENT = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SDK_EVENT_PREFIX = 'merfy:';
const NEAR_DISTANCE = 2;
const MARKUP_ACTIONS: readonly string[] = ACTION_NAMES.filter(
  (name) => isActionName(name) && ACTIONS[name].markup !== null,
);

const quoted = (names: readonly string[]): string => names.map((name) => `«${name}»`).join(', ');

// Похожее имя при расстоянии правки до 2 (как в блоке 1 и в 11д); нет — пусто.
function nearText(name: string, known: readonly string[]): string {
  const ranked = known
    .map((candidate) => ({ candidate, distance: levenshteinOf(name, candidate) }))
    .filter((item) => item.distance <= NEAR_DISTANCE)
    .sort((left, right) => left.distance - right.distance);
  const best = ranked[0]?.candidate;
  return best === undefined ? '' : `. Похожее: «${best}»`;
}

const isKnownEvent = (name: string): boolean =>
  EVENT_NAMES.includes(name) || (SECTION_EVENT.test(name) && !name.startsWith(SDK_EVENT_PREFIX));

function eventText(name: string): string {
  const near = nearText(name, EVENT_NAMES);
  if (name.startsWith(SDK_EVENT_PREFIX)) return `события «${name}» нет в каталоге событий SDK${near}`;
  return `«${name}»: событие — merfy:<объект>:<действие> из каталога SDK или <автор>:<секция>:<событие>${near}`;
}

const eventUnknown: NameRule = ({ facts }) =>
  (facts?.listens ?? [])
    .filter((item) => !isKnownEvent(item.name))
    .map((item) => problem('event-unknown', item.file, eventText(item.name), item));

// Действие SDK: имя из таблицы и у действия есть разметка (newsletter.subscribe — только из скрипта).
function sdkActionText(name: string): string | null {
  if (!isActionName(name)) return `действия SDK «${name}» нет${nearText(name, MARKUP_ACTIONS)}`;
  const spec = ACTIONS[name];
  if (spec.markup !== null) return null;
  return `действие ${name} — только из скрипта секции: ctx.${spec.module}.${name.split('.').at(-1) ?? ''}(…)`;
}

function ownActionText(name: string, input: NameInput): string | null {
  const actions = input.facts?.actions;
  const entry = input.scriptEntry ?? 'script.ts';
  if (input.facts === null) return `у секции нет скрипта: действие «${name}» пишется в actions ${entry}`;
  if (actions === null || actions === undefined || actions.includes(name)) return null;
  const known = actions.length === 0 ? 'в actions пусто' : `Есть: ${quoted(actions)}`;
  return `действия «${name}» нет в actions ${entry}. ${known}${nearText(name, actions)}`;
}

// «[событие:]имя»: форма, событие из списка, потом имя — SDK (с точкой) или своё.
function actionText(token: MarkupName, input: NameInput): string | null {
  const parts = token.name.split(':');
  const name = parts.at(-1) ?? '';
  const event = parts.length === 2 ? (parts[0] ?? '') : null;
  if (parts.length > 2 || name === '' || event === '')
    return `data-action «${token.name}»: действие — [событие:]имя, например click:pick`;
  if (event !== null && !ACTION_EVENTS.includes(event))
    return `событие «${event}» в data-action не из списка: ${ACTION_EVENTS.join(', ')}${nearText(event, ACTION_EVENTS)}`;
  return name.includes('.') ? sdkActionText(name) : ownActionText(name, input);
}

const actionUnknown: NameRule = (input) =>
  input.markup.actions.flatMap((token) => {
    const text = actionText(token, input);
    return text === null ? [] : [problem('action-unknown', TEMPLATE_FILE, text, token)];
  });

// Класс из toggleClass('…') — имя утилиты: буквы, цифры и - _ : / . (bg-primary, hover:underline, w-1/2). Скобки
// произвольного значения, кавычки и пробелы — class-arbitrary, как в шаблоне (блок 4): CSS по такому имени сборка не
// собирает. Тот же вид — у classes в script_meta (script-meta.ts) и во входах сборки.
export const SCRIPT_CLASS = /^[A-Za-z0-9_:/.-]{1,100}$/;

const scriptClasses: NameRule = ({ facts, scriptEntry }) =>
  (facts?.classes ?? [])
    .filter((name) => !SCRIPT_CLASS.test(name))
    .map((name) =>
      problem(
        'class-arbitrary',
        scriptEntry ?? 'script.ts',
        `класс «${name}» в toggleClass: только имя утилиты из словаря — буквы, цифры и - _ : / .`,
      ),
    );

export const NAME_RULES: readonly NameRule[] = [eventUnknown, actionUnknown, scriptClasses];

export const nameProblems = (input: NameInput): SectionProblem[] => NAME_RULES.flatMap((rule) => rule(input));
