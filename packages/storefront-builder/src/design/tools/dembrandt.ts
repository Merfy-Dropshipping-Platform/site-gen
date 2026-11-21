import { fileURLToPath } from 'node:url';
import { runNode, tabRun } from '../design-node';
import { at, list, numberOf, record, text } from '../design-pick';
import { buildPart, type PartBand, type StylePart, type StyleTable, type StyleValues } from '../design-style';
import type { ButtonLook } from '../design-types';
import { hexColor, opaqueHex, px, radius, visibleShadow } from '../design-values';
import { TYPE_WORDS, byCount, partFont } from './shared';
import { TAB_ORDER, ToolFailed, pinned, type StyleTool, type ToolFacts } from './tool';

// Переходник dembrandt (MIT): наш `node/dembrandt.mjs` — их `extractBranding` из `dembrandt/extractors` по уже
// открытой захватом вкладке (`node/borrow.mjs`): сайт второй раз не грузится, свой браузер пакет не запустит. Отдаёт
// палитру с ролями, типографику по контекстам (heading-1, body…), радиусы, тени, кнопки и поля. Полос страницы не
// отдаёт: полоса одна — фон и текст страницы, поэтому её уверенность ниже, чем у полос своего скрипта.
//
// Из сырого ответа убираются логотип и иконки сайта: их мы не переносим, а весят они больше всего ответа.

const DROPPED = new Set(['logo', 'logoInstances', 'favicons']);
const HEADINGS = new Set(['heading-1', 'heading-2', 'heading-3']);
const BODY = new Set(['body', 'text']);
const LEVELS: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };

type Raw = Record<string, unknown>;

const styles = (raw: Raw, contexts: ReadonlySet<string>): unknown[] =>
  list(at(raw, 'typography', 'styles'))
    .filter((style) => contexts.has(String(at(style, 'context'))))
    .sort((a, b) => (numberOf(at(b, 'count')) ?? 0) - (numberOf(at(a, 'count')) ?? 0));

const font = (contexts: ReadonlySet<string>, google: ReadonlySet<string>) => (raw: Raw) => {
  const style = styles(raw, contexts)[0];
  const family = text(at(style, 'family'));
  return family === null
    ? null
    : partFont(`${family}, ${text(at(style, 'fallbacks')) ?? ''}`, at(style, 'weight'), null, google);
};

function typeScale(raw: Raw): StyleValues['typeScale'] {
  const seen = new Set<string>();
  return list(at(raw, 'typography', 'styles')).flatMap((style) => {
    const role = TYPE_WORDS[String(at(style, 'context'))];
    const size = px(at(style, 'size'));
    if (role === undefined || size === null || size <= 0 || seen.has(role)) return [];
    seen.add(role);
    return [{ role, px: Math.round(size) }];
  });
}

const defaults = (button: unknown): Raw => record(at(button, 'states', 'default'));
const filled = (raw: Raw): Raw[] =>
  list(at(raw, 'components', 'buttons'))
    .map(defaults)
    .filter((state) => opaqueHex(state.backgroundColor) !== null);

function buttonPairs(raw: Raw): Array<[string, string | null]> {
  const pairs = new Map<string, string | null>();
  for (const state of filled(raw)) pairs.set(opaqueHex(state.backgroundColor) ?? '', hexColor(state.color));
  return [...pairs.entries()];
}

function bands(raw: Raw): PartBand[] {
  const bg = opaqueHex(at(raw, 'colors', 'semantic', 'background'));
  if (bg === null) return [];
  const [first, second] = buttonPairs(raw);
  return [
    {
      bg,
      fg: hexColor(at(raw, 'colors', 'semantic', 'text'), bg),
      primary: first?.[0] ?? opaqueHex(at(raw, 'colors', 'semantic', 'primary')),
      primaryFg: first?.[1] ?? null,
      secondary: second?.[0] ?? null,
      secondaryFg: second?.[1] ?? null,
      area: 1,
      top: 0,
    },
  ];
}

const buttonRadius = (raw: Raw): number | null => radius(filled(raw)[0]?.borderRadius);
const inputRadius = (raw: Raw): number | null =>
  radius(at(raw, 'components', 'inputs', 'text', 0, 'states', 'default', 'borderRadius'));

function mediaRadius(raw: Raw): number | null {
  const images = list(at(raw, 'borderRadius', 'values')).filter((value) => list(at(value, 'elements')).includes('img'));
  const best = images.sort((a, b) => (numberOf(at(b, 'count')) ?? 0) - (numberOf(at(a, 'count')) ?? 0))[0];
  return best === undefined ? null : radius(at(best, 'value'));
}

function buttonLook(raw: Raw): ButtonLook | null {
  const first = list(at(raw, 'components', 'buttons'))[0];
  if (first === undefined) return null;
  const state = defaults(first);
  const looks: Array<[boolean, ButtonLook]> = [
    [opaqueHex(state.backgroundColor) !== null, 'filled'],
    [(px(state.border) ?? 0) >= 1, 'outline'],
  ];
  return looks.find(([hit]) => hit)?.[1] ?? 'text';
}

const shadows = (raw: Raw): boolean =>
  list(raw.shadows).some(
    (shadow) => (LEVELS[String(at(shadow, 'confidence'))] ?? 0) >= 0.6 && visibleShadow(at(shadow, 'shadow')),
  );

const motion = (raw: Raw): boolean => list(at(raw, 'motion', 'animations')).length > 0;
const buttons = (raw: Raw): number => byCount(filled(raw).length, 3);

function table(google: ReadonlySet<string>): StyleTable<Raw> {
  return {
    title: { take: (raw) => text(raw.siteName), confidence: 0.5 },
    bands: { take: bands, confidence: 0.4 },
    'fonts.heading': { take: font(HEADINGS, google), confidence: 0.7 },
    'fonts.body': { take: font(BODY, google), confidence: 0.75 },
    typeScale: { take: typeScale, confidence: 0.7 },
    'radius.button': { take: buttonRadius, confidence: buttons },
    'radius.input': { take: inputRadius, confidence: 0.6 },
    'radius.media': { take: mediaRadius, confidence: 0.4 },
    'button.look': { take: buttonLook, confidence: buttons },
    shadows: { take: shadows, confidence: 0.6 },
    motion: { take: motion, confidence: 0.4 },
  };
}

// Ответ без логотипа и иконок; ответ-ошибка — ToolFailed с их текстом.
export function trimmed(answer: unknown): Raw {
  const raw = record(answer);
  const error = text(at(raw, 'error', 'message')) ?? text(raw.error);
  if (error !== null) throw new ToolFailed(`dembrandt: ${(error.split('\n')[0] ?? '').slice(0, 300)}`);
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !DROPPED.has(key)));
}

export const dembrandtStyle = (raw: unknown, facts: Pick<ToolFacts, 'google'>): StylePart =>
  buildPart(record(raw), table(facts.google));

const SCRIPT = fileURLToPath(new URL('../node/dembrandt.mjs', import.meta.url));

export const dembrandt: StyleTool = {
  name: 'dembrandt',
  version: pinned('dembrandt'),
  // Меняет страницу (баннер cookie, заморозка анимаций, раскрытые меню) — идёт последним. На вкладке захвата
  // (стенд 21.11): 4–12 с на магазинах, 24 с на длинном лендинге tilda.cc; раньше со своей загрузкой — 30–42 с.
  order: TAB_ORDER.changes,
  limitMs: 30_000,
  raw: async ({ captured, budgetMs }) => trimmed(await runNode(tabRun(SCRIPT, captured, budgetMs))),
  style: dembrandtStyle,
};
