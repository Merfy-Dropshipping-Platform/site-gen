import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import { MANIFEST_FILE, TEMPLATE_FILE, type SectionFiles } from './format';
import { positionAt } from './position';
import { problem, type ProblemCode, type SectionProblem } from './problems';
import { codeFound } from './taste-code';

// Проверки вкуса (спека MCP-секций, §9, последний пункт): кнопки от 44 px, нет прокрутки вбок, «уменьшить движение».
// Только предупреждения: секция сохраняется, ИИ исправляет по ответу. Своего CSS у секции нет (styles.md), поэтому
// правила читают классы Tailwind шаблона по элементам и текст скрипта. Классы с вариантом sm:, md:… в ширину не
// считаются: они включаются от 640 px, а телефон — 375 px. Что уже гарантирует SDK, здесь не проверяется: поведения
// data-behavior, пресеты data-animate и ctx.animate сами учитывают «уменьшить движение», обёртка закрепления несёт
// motion-reduce:transition-none.
const TOUCH_PX = 44;
const PHONE_PX = 375;
const SPACING_PX = 4; // шаг шкалы отступов словаря: h-11 — 44 px

// Именованные ширины Tailwind от sm (384 px) и шире.
const NAMED_WIDE = new Set(['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl']);
// Ссылка или поле, которое выглядит кнопкой: фон кнопки словаря или скругление кнопки.
const BUTTON_LOOK = /^(?:rounded-button|bg-(?:primary|secondary)(?:-hover)?)$/;
const MOTION_GUARD = /matchMedia\(\s*['"`]\(\s*prefers-reduced-motion/;
const SCRIPT_FILE = /\.(?:ts|js)$/;

interface ClassAt {
  name: string;
  at: number;
}

interface Element {
  tag: string;
  role: string;
  classes: ClassAt[];
}

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');

// Имя тега или атрибута: div, class, class:list.
function nameText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!isNode(value)) return '';
  if (value.type === 'JSXNamespacedName')
    return `${nameText(fieldOf(value, 'namespace'))}:${nameText(fieldOf(value, 'name'))}`;
  return nameText(fieldOf(value, 'name'));
}

// Строки-литералы внутри атрибута class или class:list, у каждой слова с местом в тексте шаблона.
function classesOfAttribute(attribute: AstNode): ClassAt[] {
  const value = fieldOf(attribute, 'value');
  if (!isNode(value)) return [];
  const literals = value.type === 'Literal' ? [value] : nodesOf(value).filter((node) => node.type === 'Literal');
  return literals.flatMap((literal) => {
    const text = fieldOf(literal, 'value');
    if (typeof text !== 'string') return [];
    return [...text.matchAll(/\S+/g)].map((match) => ({ name: match[0], at: literal.start + 1 + (match.index ?? 0) }));
  });
}

function elementOf(node: AstNode): Element {
  const attributes = fieldOf(node, 'attributes');
  const list = Array.isArray(attributes) ? attributes.filter(isNode) : [];
  const named = (name: string): AstNode[] =>
    list.filter((item) => item.type === 'JSXAttribute' && nameText(item) === name);
  const role = named('role')[0];
  const roleValue = role === undefined ? undefined : fieldOf(role, 'value');
  return {
    tag: nameText(node),
    role: isNode(roleValue) ? stringOf(fieldOf(roleValue, 'value')) : '',
    classes: [...named('class'), ...named('class:list')].flatMap(classesOfAttribute),
  };
}

// «md:h-8» → варианты ['md'], утилита 'h-8'.
const partsOf = (name: string): { variants: string[]; utility: string } => {
  const segments = name.split(':');
  return { variants: segments.slice(0, -1), utility: segments[segments.length - 1] ?? '' };
};

const plainUtilities = (element: Element): string[] =>
  element.classes
    .map((item) => partsOf(item.name))
    .filter((item) => item.variants.length === 0)
    .map((item) => item.utility);

type Found = { at: number; code: ProblemCode; message: string };

// ---- кнопки от 44 px

function isButton(element: Element): boolean {
  if (element.tag === 'button' || element.role === 'button') return true;
  if (element.tag !== 'a' && element.tag !== 'input') return false;
  return plainUtilities(element).some((utility) => BUTTON_LOOK.test(utility));
}

function heightPx(utility: string): number | undefined {
  if (/^(?:min-)?h-px$/.test(utility)) return 1;
  const match = /^(?:min-h|h|size)-(\d+(?:\.\d+)?)$/.exec(utility);
  return match === null ? undefined : Number(match[1]) * SPACING_PX;
}

function buttonFound(element: Element): Found[] {
  if (!isButton(element)) return [];
  const floor = plainUtilities(element).some(
    (utility) => /^min-h-/.test(utility) && (heightPx(utility) ?? 0) >= TOUCH_PX,
  );
  if (floor) return [];
  return element.classes.flatMap((item) => {
    const px = heightPx(partsOf(item.name).utility);
    if (px === undefined || px >= TOUCH_PX) return [];
    const message = `кнопка с классом ${item.name} — ${px} px, меньше ${TOUCH_PX} px: палец попадает хуже. Возьми h-11 или min-h-11`;
    return [{ at: item.at, code: 'taste-button-height' as const, message }];
  });
}

// ---- прокрутка вбок

function isWide(utility: string): boolean {
  const named = /^(?:min-)?w-(.+)$/.exec(utility)?.[1];
  if (named === undefined) return false;
  if (NAMED_WIDE.has(named)) return true;
  return /^\d+(?:\.\d+)?$/.test(named) && Number(named) * SPACING_PX > PHONE_PX;
}

// Текст предупреждения о классе без вариантов: 100vw, перенос запрещён, ширина шире телефона без max-w-*.
function overflowText(name: string, utility: string, limited: boolean): string | undefined {
  if (/^(?:min-)?w-screen$/.test(utility))
    return `${name} — 100vw: с полосой прокрутки шире экрана, страница уезжает вбок. Возьми w-full`;
  if (utility === 'whitespace-nowrap')
    return `${name}: длинный текст не переносится и уезжает за экран телефона. Убери класс или добавь truncate`;
  if (isWide(utility) && !limited)
    return `${name}: ширина больше ${PHONE_PX} px экрана телефона и нет max-w-*. Добавь max-w-full`;
  return undefined;
}

function overflowFound(element: Element): Found[] {
  const limited = plainUtilities(element).some((utility) => utility.startsWith('max-w-'));
  return element.classes.flatMap((item) => {
    const { variants, utility } = partsOf(item.name);
    const message = variants.length > 0 ? undefined : overflowText(item.name, utility, limited);
    return message === undefined ? [] : [{ at: item.at, code: 'taste-overflow' as const, message }];
  });
}

// ---- «уменьшить движение»

const MOTION_GUARDS = { animate: 'animate-none', transition: 'transition-none', scroll: 'scroll-auto' } as const;
type Motion = keyof typeof MOTION_GUARDS;

function motionOf(utility: string): Motion | undefined {
  if (utility.startsWith('animate-') && utility !== 'animate-none') return 'animate';
  if ((utility === 'transition' || utility.startsWith('transition-')) && utility !== 'transition-none')
    return 'transition';
  return utility === 'scroll-smooth' ? 'scroll' : undefined;
}

const MOTIONS: readonly Motion[] = ['animate', 'transition', 'scroll'];

// Какие виды движения элемент отменяет для «уменьшить движение»: motion-reduce:animate-none и подобные.
function guardedMotions(element: Element): ReadonlySet<Motion> {
  const offs = element.classes
    .map((item) => partsOf(item.name))
    .filter((item) => item.variants.includes('motion-reduce'))
    .map((item) => item.utility);
  return new Set(MOTIONS.filter((motion) => offs.includes(MOTION_GUARDS[motion])));
}

function motionFound(element: Element): Found[] {
  const guarded = guardedMotions(element);
  return element.classes.flatMap((item) => {
    const { variants, utility } = partsOf(item.name);
    const motion = motionOf(utility);
    if (
      motion === undefined ||
      guarded.has(motion) ||
      variants.includes('motion-safe') ||
      variants.includes('motion-reduce')
    )
      return [];
    const message = `${item.name}: движение без учёта «уменьшить движение». Напиши motion-safe:${item.name} или добавь motion-reduce:${MOTION_GUARDS[motion]}`;
    return [{ at: item.at, code: 'taste-motion' as const, message }];
  });
}

// Классы по элементам и код выражений шаблона (taste-code.ts) — по одному разбору.
async function templateFound(text: string): Promise<Found[]> {
  const { parse } = await import('@astrojs/compiler-rs');
  const { ast } = await Promise.resolve(parse(text));
  const byElement = nodesOf(ast)
    .filter((node) => node.type === 'JSXOpeningElement')
    .map(elementOf)
    .flatMap((element) => [...buttonFound(element), ...overflowFound(element), ...motionFound(element)]);
  return [...byElement, ...codeFound(ast, text)];
}

// ---- скрипт

// animate( и el.animate( — анимация Web Animations; ctx.animate SDK «уменьшить движение» учитывает сам.
const SCRIPT_MOTION = /[\w$.]*\banimate\s*\(|\brequestAnimationFrame\b/g;
const isComment = (line: string): boolean => /^\s*(?:\/\/|\/\*|\*)/.test(line);

function scriptProblems(file: string, text: string): SectionProblem[] {
  if (MOTION_GUARD.test(text)) return [];
  return text.split('\n').flatMap((line, index) => {
    if (isComment(line)) return [];
    return [...line.matchAll(SCRIPT_MOTION)]
      .filter((match) => !match[0].startsWith('ctx.animate'))
      .map((match) => {
        const message = `${match[0].replace(/\s*\($/, '(')}: движение в скрипте без проверки matchMedia('(prefers-reduced-motion: reduce)'). Для анимации элемента возьми ctx.animate — она настройку учитывает`;
        return problem('taste-motion', file, message, { line: index + 1, column: (match.index ?? 0) + 1 });
      });
  });
}

// Предупреждения вкуса секции: шаблон и файлы скрипта. Шаблон не разобрался — его ошибку сообщает компиляция.
export async function tasteProblems(files: SectionFiles): Promise<SectionProblem[]> {
  const template = files[TEMPLATE_FILE];
  let found: Found[] = [];
  if (template !== undefined) {
    try {
      found = await templateFound(template);
    } catch {
      found = [];
    }
  }
  const fromTemplate = found
    .sort((left, right) => left.at - right.at)
    .map((item) =>
      problem(
        item.code,
        TEMPLATE_FILE,
        item.message,
        template === undefined ? undefined : positionAt(template, item.at),
      ),
    );
  const fromScripts = Object.entries(files)
    .filter(([file]) => file !== MANIFEST_FILE && SCRIPT_FILE.test(file))
    .flatMap(([file, text]) => scriptProblems(file, text));
  return [...fromTemplate, ...fromScripts];
}
