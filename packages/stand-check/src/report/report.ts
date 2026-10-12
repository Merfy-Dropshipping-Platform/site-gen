import { escapeHtml } from '../html';
import type { Difference, Op, Passport, PassportField, Severity, Verdict } from '../types';

export type ReportInput = {
  verdict: Verdict;
  differences: Difference[];
  before: Passport;
  after: Passport;
  checklist: string;
  shots?: ShotEntry[];
};

// Снимок в отчёте (Э3): картинки «до», «после», «отличия» — пути от папки отчёта или адреса в хранилище.
export type ShotEntry = { title: string; images: { label: string; src: string }[]; note: string; over: boolean };

const FIELD_TITLE: Record<PassportField, string> = {
  scripts: 'Скрипты',
  globals: 'Глобалы __MERFY_*__',
  storage: 'Ключи браузера',
  cookies: 'Cookie',
  requests: 'Запросы',
  errors: 'Ошибки консоли',
  tokens: 'Токены на :root',
  fonts: 'Шрифты',
};
const OP_TEXT: Record<Op, string> = { added: 'появилось', removed: 'пропало', changed: 'поменялось' };
const SEVERITY_TEXT: Record<Severity, string> = { red: 'красный', amber: 'жёлтый' };
const DIFFERENCE_WORD: Record<Intl.LDMLPluralRule, string> = {
  zero: 'отличий',
  one: 'отличие',
  two: 'отличия',
  few: 'отличия',
  many: 'отличий',
  other: 'отличия',
};
const PLURAL = new Intl.PluralRules('ru-RU');

// Вердикт словами — как в живом образце стенда.
const VERDICT_VIEW: Record<Verdict, { tone: string; title: (count: string) => string; text: string }> = {
  clean: {
    tone: 'clean',
    title: () => 'Чисто: прогоны совпадают',
    text: 'Сборка проходит. Так и должно быть, когда на стенде ничего не меняли.',
  },
  amber: { tone: 'amber', title: (count) => `Жёлтый: ${count}`, text: 'Сборка проходит, тестировщик смотрит глазами.' },
  red: {
    tone: 'red',
    title: (count) => `Красный: ${count}`,
    text: 'Сборка не проходит, пока отличие не объяснят или не исправят.',
  },
};

const REPORT_CSS = [
  'body{font-family:system-ui,sans-serif;margin:24px;line-height:1.45;color:#1b1b1b}',
  '.verdict{padding:12px 16px;border-radius:8px}.verdict.clean{background:#e7f6ec}',
  '.verdict.amber{background:#fff4d6}.verdict.red{background:#fde4e4}',
  'li.red .severity{color:#b42318}li.amber .severity{color:#9a6700}.severity{font-weight:700;margin-right:8px}',
  '.why{color:#555}.passports{display:grid;grid-template-columns:1fr 1fr;gap:16px}',
  'pre{background:#f6f6f6;padding:12px;overflow:auto;font-size:12px}',
  'table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px;vertical-align:top}',
  'td.pass{color:#1a7f37}td.fail{color:#b42318}',
  '.shots{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0}li.amber>b{color:#9a6700}',
].join('');

export const differenceCount = (count: number): string => `${count} ${DIFFERENCE_WORD[PLURAL.select(count)]}`;

export const verdictTitle = (verdict: Verdict, count: number): string =>
  VERDICT_VIEW[verdict].title(differenceCount(count));

const valueText = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

function shown(name: string, value: unknown): string {
  const text = valueText(value);
  return text === name ? name : `${name} = ${text}`;
}

// Как показать отличие: одно значение для «появилось» и «пропало», пару «было → стало» для «поменялось».
const DESCRIBE: Record<Op, (difference: Difference) => string> = {
  added: (difference) => shown(difference.name, difference.after),
  removed: (difference) => shown(difference.name, difference.before),
  changed: (difference) => `${difference.name}: ${valueText(difference.before)} → ${valueText(difference.after)}`,
};

function differenceItem(difference: Difference): string {
  const what = `<b>${escapeHtml(FIELD_TITLE[difference.field])}:</b> ${OP_TEXT[difference.op]}`;
  return [
    `<li class="${difference.severity}">`,
    `<span class="severity">${SEVERITY_TEXT[difference.severity]}</span>`,
    `${what} <code>${escapeHtml(DESCRIBE[difference.op](difference))}</code>`,
    `<div class="why">${escapeHtml(difference.reason)}</div>`,
    '</li>',
  ].join('');
}

function differencesBlock(differences: readonly Difference[]): string {
  const body =
    differences.length === 0 ? '<p>Отличий нет.</p>' : `<ol>${differences.map(differenceItem).join('')}</ol>`;
  return `<section><h2>Отличия</h2>${body}</section>`;
}

function passportsBlock(before: Passport, after: Passport): string {
  const column = (title: string, passport: Passport): string =>
    `<div><h3>${title}</h3><pre>${escapeHtml(JSON.stringify(passport, null, 2))}</pre></div>`;
  return `<section><h2>Паспорта</h2><div class="passports">${column('Было', before)}${column('Стало', after)}</div></section>`;
}

function shotItem(shot: ShotEntry): string {
  const figures = shot.images.map(
    (image) =>
      `<figure><img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.label)}" width="320">` +
      `<figcaption>${escapeHtml(image.label)}</figcaption></figure>`,
  );
  const tone = shot.over ? 'amber' : 'clean';
  return `<li class="${tone}"><b>${escapeHtml(shot.title)}</b> — ${escapeHtml(shot.note)}<div class="shots">${figures.join('')}</div></li>`;
}

// Снимки (Э3): раздел есть, только когда модуль включён. Отличие выше порога — жёлтое (Э10-1 А).
function shotsBlock(shots: readonly ShotEntry[] | undefined): string {
  if (shots === undefined) return '';
  return `<section><h2>Снимки</h2><ol>${shots.map(shotItem).join('')}</ol></section>`;
}

// Отчёт прогона — чистая функция: вердикт, отличия с причинами, два паспорта рядом, чек-лист (design.md 5.6).
export function renderReport(input: ReportInput): string {
  const view = VERDICT_VIEW[input.verdict];
  const title = view.title(differenceCount(input.differences.length));
  return [
    '<!doctype html>',
    '<html lang="ru"><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)} — стенд</title>`,
    `<style>${REPORT_CSS}</style></head><body>`,
    `<section class="verdict ${view.tone}"><h1>${escapeHtml(title)}</h1><p>${view.text}</p></section>`,
    differencesBlock(input.differences),
    shotsBlock(input.shots),
    passportsBlock(input.before, input.after),
    `<section><h2>Чек-лист тестировщика</h2>${input.checklist}</section>`,
    '</body></html>',
    '',
  ].join('\n');
}
