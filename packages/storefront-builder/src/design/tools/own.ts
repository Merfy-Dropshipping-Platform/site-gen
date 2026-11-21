import { createHash } from 'node:crypto';
import { pageScript, scriptSource } from '../design-scripts';
import { at, flag, list, numberOf, record, text } from '../design-pick';
import { buildPart, type PartBand, type StylePart, type StyleTable, type StyleValues } from '../design-style';
import { hexColor, opaqueHex, radius, wholePx } from '../design-values';
import { ALIGN_WORDS, BUTTON_WORDS, CARD_WORDS, TYPE_WORDS, byCount, partFont } from './shared';
import { TAB_ORDER, ToolFailed, type StyleTool, type ToolFacts } from './tool';

// Переходник `own`: свой скрипт стиля в уже открытой нами странице (`browser/own.js`), без Node. Точка отсчёта для
// сравнения на стенде и запасной путь, когда чужие инструменты упали. Версия — начало хеша скрипта: поменяли скрипт —
// старые снимки в кэше шлюза (24 ч) видно по `tool_version`.

export const OWN_VERSION = `js-${createHash('sha256')
  .update(scriptSource(['blocks', 'own']))
  .digest('hex')
  .slice(0, 8)}`;

type Raw = Record<string, unknown>;

function band(item: unknown): PartBand | null {
  const bg = opaqueHex(at(item, 'background'));
  if (bg === null) return null;
  const color = (key: string): string | null => hexColor(at(item, key), bg);
  return {
    bg,
    fg: color('text'),
    heading: color('heading'),
    primary: opaqueHex(at(item, 'button_bg')),
    primaryFg: color('button_text'),
    secondary: opaqueHex(at(item, 'button2_bg')),
    secondaryFg: color('button2_text'),
    area: numberOf(at(item, 'share')) ?? 0,
    top: numberOf(at(item, 'top')) ?? 0,
  };
}

const bands = (raw: Raw): PartBand[] => list(raw.bands).flatMap((item) => band(item) ?? []);

const font = (role: string, google: ReadonlySet<string>) => (raw: Raw) => {
  const found = at(raw, 'fonts', role);
  const stack = text(at(found, 'stack')) ?? text(at(found, 'family'));
  return stack === null ? null : partFont(stack, at(found, 'weight'), flag(at(found, 'cyrillic')), google);
};

const typeScale = (raw: Raw): StyleValues['typeScale'] =>
  list(raw.type_scale).flatMap((item) => {
    const role = TYPE_WORDS[String(at(item, 'role'))];
    const size = numberOf(at(item, 'px'));
    return role === undefined || size === null ? [] : [{ role, px: Math.round(size) }];
  });

const count = (kind: string, enough: number) => (raw: Raw) => byCount(numberOf(at(raw, 'counts', kind)) ?? 0, enough);
const radiusOf = (key: string) => (raw: Raw) => radius(at(raw, 'radius', key));
const pxOf = (group: string, key: string) => (raw: Raw) => wholePx(at(raw, group, key));
const word =
  <T>(group: string, key: string, words: Record<string, T>) =>
  (raw: Raw) =>
    words[String(at(raw, group, key))] ?? null;

function table(google: ReadonlySet<string>): StyleTable<Raw> {
  return {
    bands: { take: bands, confidence: 0.7 },
    'fonts.heading': { take: font('heading', google), confidence: 0.8 },
    'fonts.body': { take: font('body', google), confidence: 0.8 },
    typeScale: { take: typeScale, confidence: 0.7 },
    'radius.button': { take: radiusOf('button'), confidence: count('buttons', 3) },
    'radius.card': { take: radiusOf('card'), confidence: count('cards', 3) },
    'radius.input': { take: radiusOf('input'), confidence: count('inputs', 2) },
    'radius.media': { take: radiusOf('media'), confidence: count('media', 3) },
    'border.card': { take: pxOf('border', 'card'), confidence: count('cards', 3) },
    'button.look': { take: word('button', 'look', BUTTON_WORDS), confidence: count('buttons', 3) },
    'card.look': { take: word('card', 'look', CARD_WORDS), confidence: count('cards', 3) },
    'card.align': { take: word('card', 'align', ALIGN_WORDS), confidence: count('cards', 3) },
    'spacing.sectionGap': { take: pxOf('spacing', 'section_gap'), confidence: 0.5 },
    'spacing.card': { take: pxOf('spacing', 'card'), confidence: count('cards', 3) },
    shadows: { take: (raw) => flag(raw.shadows), confidence: 0.6 },
    widthPage: { take: (raw) => wholePx(raw.width_page) || null, confidence: 0.5 },
    motion: { take: (raw) => flag(raw.motion), confidence: 0.4 },
  };
}

export const ownStyle = (raw: unknown, facts: Pick<ToolFacts, 'google'>): StylePart =>
  buildPart(record(raw), table(facts.google));

export const own: StyleTool = {
  name: 'own',
  version: OWN_VERSION,
  // Свой скрипт по нетронутой странице, миллисекунды: готов раньше чужих, поэтому запасной путь не ждёт их срока.
  order: TAB_ORDER.own,
  limitMs: 15_000,
  raw: async ({ captured, budgetMs }) => {
    const found = await captured.evaluate(pageScript('own'), budgetMs);
    if (typeof found !== 'object' || found === null) throw new ToolFailed('свой скрипт вернул не объект');
    return found;
  },
  style: ownStyle,
};
