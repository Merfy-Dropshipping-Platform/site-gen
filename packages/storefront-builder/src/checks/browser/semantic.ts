// Семантика в открытой странице (место `browser`, снимок черновика). Готовый инструмент — axe-core (Deque, MPL-2.0; на
// нём раздел доступности Lighthouse). Здесь — только то, что видно лишь в собранной странице: ориентиры (header, main,
// footer), устройство списков, недопустимые role, кнопка в ссылке. Заголовки, пустые заголовки, тексты кнопок и ссылок
// и alt проверяет место `html` по исходнику: axe смотрит только видимое и пропускает заголовки в закрытых окнах.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { grouped, type CheckFinding } from '../finding';

export const AXE_RULES = [
  'region',
  'landmark-one-main',
  'landmark-unique',
  'landmark-no-duplicate-banner',
  'landmark-no-duplicate-contentinfo',
  'landmark-banner-is-top-level',
  'landmark-contentinfo-is-top-level',
  'landmark-main-is-top-level',
  'list',
  'listitem',
  'aria-allowed-role',
  'nested-interactive',
] as const;

let axeSource: string | undefined;
// Скрипт axe-core для `addScriptTag`: читается один раз на процесс.
export function axeScript(): string {
  axeSource ??= readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
  return axeSource;
}

// Скрипт страницы: axe по всему документу, у каждого нарушения — секция элемента (`data-section-id`), тег, role и
// начало текста. Секция — по ближайшей обёртке: так один прогон обслуживает и снимок страницы, и снимок секций.
export const AXE_IN_PAGE = `async (rules) => {
  const axe = window.axe;
  if (!axe) throw new Error('axe не подключился');
  const result = await axe.run(document, { runOnly: { type: 'rule', values: rules }, resultTypes: ['violations'] });
  const out = [];
  for (const violation of result.violations) {
    for (const node of violation.nodes) {
      const target = node.target && node.target[0];
      let element = null;
      try { element = typeof target === 'string' ? document.querySelector(target) : null; } catch (error) { element = null; }
      const wrapper = element && element.closest('[data-section-id]');
      out.push({
        rule: violation.id,
        section: wrapper ? wrapper.getAttribute('data-section-id') : null,
        tag: element ? element.tagName.toLowerCase() : null,
        role: element ? element.getAttribute('role') : null,
        text: element ? (element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60) : '',
      });
    }
  }
  return out;
}`;

export const AxeRaw = z.array(
  z.object({
    rule: z.string(),
    section: z.string().nullable(),
    tag: z.string().nullable(),
    role: z.string().nullable(),
    text: z.string(),
  }),
);
export type AxeNode = z.infer<typeof AxeRaw>[number];

// «что не так · как починить» по правилу axe.
function textOf(node: AxeNode): string {
  const tag = node.tag ?? 'элемент';
  switch (node.rule) {
    case 'region':
      return 'Содержимое вне ориентиров страницы · шапку оберни в <header>, подвал — в <footer>, остальное лежит в <main>';
    case 'landmark-one-main':
      return 'На странице нет <main> · основное содержимое — в <main>';
    case 'landmark-unique':
      return `Несколько ${tag} без своих имён · дай каждому aria-label`;
    case 'landmark-no-duplicate-banner':
      return 'Две шапки-ориентира · <header> верхнего уровня один на страницу';
    case 'landmark-no-duplicate-contentinfo':
      return 'Два подвала-ориентира · <footer> верхнего уровня один на страницу';
    case 'landmark-banner-is-top-level':
    case 'landmark-contentinfo-is-top-level':
    case 'landmark-main-is-top-level':
      return `${tag} внутри другого ориентира · вынеси на верхний уровень страницы`;
    case 'list':
      return 'В списке не только <li> · внутри <ul> и <ol> — только <li>';
    case 'listitem':
      return '<li> вне списка · оберни в <ul> или <ol>';
    case 'aria-allowed-role':
      return `role="${node.role ?? ''}" не подходит тегу ${tag} · убери role или смени тег`;
    case 'nested-interactive':
      return 'Кнопка или ссылка внутри другой · разнеси их: вложенную нельзя нажать с клавиатуры';
    default:
      return node.rule;
  }
}

function whereOf(node: AxeNode): string {
  if (node.tag === null) return 'страница';
  if (!node.text) return node.tag;
  return `${node.tag} «${node.text.length > 40 ? `${node.text.slice(0, 40)}…` : node.text}»`;
}

// Находки семантики из нарушений axe; какие секции показывать — решает вызывающий (`inSections`).
export function semanticBrowser(raw: unknown): CheckFinding[] {
  return grouped(
    AxeRaw.parse(raw).map((node) => ({
      place: 'browser' as const,
      check: 'semantic',
      rule: node.rule,
      level: 'warning' as const,
      section: node.section,
      where: whereOf(node),
      text: textOf(node),
    })),
  );
}
