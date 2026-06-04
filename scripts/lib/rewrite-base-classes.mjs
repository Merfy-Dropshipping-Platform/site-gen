// Переписать base/<Блок>.classes.ts — заменить захардкоженные значения
// в строковых литералах на var(--<токен>) для аспектов из tokensSuggested.
//
// Например для tokensSuggested = [
//   { name: '--header-nav-max-width-2xl', element: 'nav', property: 'max-width', breakpoint: '2xl', state: null },
// ]
//
// и base classes:
//   nav: 'w-full max-w-[var(--container-max-width,1320px)] mx-auto px-4 md:px-6 flex items-center relative',
//
// нужно дописать `2xl:max-w-[var(--header-nav-max-width-2xl)]` если ещё не было.
//
// Стратегия: для каждого предложенного токена находим утилиту того же property
// в том же state/breakpoint. Если найдена — заменяем её значение на var(--токен).
// Если не найдена — дописываем новую утилиту в конец.

import { extractClassesObject, flattenClasses } from './classes-ts.mjs';
import { classifyUtility, splitPrefixes } from './utility-classify.mjs';

/**
 * @param {string} sourceText — содержимое <Блок>.classes.ts
 * @param {string} exportName — например, 'HeaderClasses'
 * @param {Array} tokensSuggested — из каталога
 * @returns {{ replacements: Array<{ elementKey: string, oldClass: string, newClass: string }>, summary: object }}
 */
export function computeReplacements(sourceText, exportName, tokensSuggested) {
  const obj = extractClassesObject(sourceText, exportName);
  const flat = flattenClasses(obj);

  // Группировать токены по элементу
  const byElement = new Map();
  for (const t of tokensSuggested) {
    if (!byElement.has(t.element)) byElement.set(t.element, []);
    byElement.get(t.element).push(t);
  }

  const replacements = [];
  const summary = { elementsTouched: 0, utilitiesReplaced: 0, utilitiesAdded: 0 };

  for (const [elementKey, tokens] of byElement.entries()) {
    const currentClass = flat[elementKey];
    if (typeof currentClass !== 'string') continue;

    const newClass = applyTokensToClass(currentClass, tokens, summary);

    if (newClass !== currentClass) {
      replacements.push({
        elementKey,
        oldClass: currentClass,
        newClass,
      });
      summary.elementsTouched++;
    }
  }

  return { replacements, summary };
}

/**
 * Применить токены к строке classes.
 * Для каждого токена ищем существующую утилиту того же (property, state, breakpoint).
 * - Если найдена и значение отличается от var(--токен) — заменяем.
 * - Если не найдена — дописываем `<prefix>:<property-utility>-[var(--токен)]`.
 */
export function applyTokensToClass(currentClass, tokens, summary) {
  const utilities = currentClass.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    const propUtility = propertyToUtilityName(token.property);
    if (!propUtility) continue;

    const prefix = [token.breakpoint, token.state].filter(Boolean).join(':');
    const prefixDot = prefix ? `${prefix}:` : '';
    const newValue = `${prefixDot}${propUtility}-[var(${token.name})]`;

    // Найти существующую утилиту того же класса
    const idx = utilities.findIndex((u) => {
      const c = classifyUtility(u);
      if (!c) return false;
      return c.property === token.property
        && (c.state || null) === (token.state || null)
        && (c.breakpoint || null) === (token.breakpoint || null);
    });

    if (idx >= 0) {
      // Заменить
      if (utilities[idx] !== newValue) {
        utilities[idx] = newValue;
        summary.utilitiesReplaced++;
      }
    } else {
      // Добавить
      utilities.push(newValue);
      summary.utilitiesAdded++;
    }
  }

  return utilities.join(' ');
}

/**
 * Перевести property → имя tailwind утилиты.
 *   'max-width' → 'max-w'
 *   'font-size' → 'text'
 *   'background-color' → 'bg'
 *   и т.д.
 */
export function propertyToUtilityName(property) {
  const map = {
    'max-width':         'max-w',
    'min-width':         'min-w',
    'width':             'w',
    'height':            'h',
    'min-height':        'min-h',
    'max-height':        'max-h',
    'font-size':         'text',
    'color':             'text',
    'background-color':  'bg',
    'border-color':      'border',
    'border-width':      'border',
    'border-style':      'border',
    'border-radius':     'rounded',
    'padding':           'p',
    'padding-x':         'px',
    'padding-y':         'py',
    'padding-top':       'pt',
    'padding-right':     'pr',
    'padding-bottom':    'pb',
    'padding-left':      'pl',
    'margin':            'm',
    'margin-x':          'mx',
    'margin-y':          'my',
    'margin-top':        'mt',
    'margin-right':      'mr',
    'margin-bottom':     'mb',
    'margin-left':       'ml',
    'gap':               'gap',
    'gap-x':             'gap-x',
    'gap-y':             'gap-y',
    'letter-spacing':    'tracking',
    'line-height':       'leading',
    'opacity':           'opacity',
    'font-weight':       'font',
    'font-family':       '[font-family',
  };
  return map[property] || null;
}
