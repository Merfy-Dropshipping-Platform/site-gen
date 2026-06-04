// Парсинг Astro-файла через @astrojs/compiler AST.
// Извлекает классы Tailwind по элементам через семантические маркеры.
//
// Используется и для текущей базы (theme-base/blocks/<Блок>/<Блок>.astro)
// и для github-источника темы (sources/<тема>-<Блок>.astro).

import { parse } from '@astrojs/compiler';

// ── Семантические карты элементов по блокам.
// Каждая запись:
//   key — имя элемента в каталоге
//   match(node) → boolean — соответствует ли узел этому элементу
//
// Если для блока нет карты — ошибка с подсказкой добавить.

// !! Селекторы должны находить элементы в обеих архитектурах:
//   1) Текущая база (theme-base/blocks/Header/Header.astro) — с маркерами data-header-wrapper, id="mobile-menu-button", id="cart-badge"
//   2) Источник темы из github — со своими маркерами (например rose использует id="rose-burger-btn", data-cart-count, data-action="toggle-search", data-cart-open, data-nt="rose-header")
//
// Подход: каждый селектор пробует несколько маркеров — данные attribute, role-based, или class hints.
// При расхождении (один источник имеет элемент, другой нет) — элемент будет помечен как не найденный.

export const BLOCK_ELEMENT_SELECTORS = {
  Header: [
    {
      key: 'wrapper',
      match: (n) => n.name === 'div' && (
        hasAttr(n, 'data-header-wrapper') ||
        // первый <div> верхнего уровня в источнике темы (rose: <div class="w-full">)
        false
      ),
    },
    {
      key: 'header',
      match: (n) => n.name === 'header',
    },
    {
      key: 'nav',
      match: (n) => n.name === 'nav' && (
        hasAnyClassToken(n, 'max-w-[1920px]') ||
        hasAnyClassToken(n, 'max-w-[var(--container-max-width,1320px)]') ||
        hasAnyClassToken(n, 'max-w-[var(--container-max-width)]') ||
        // rose источник — <nav> для основного меню
        getAttrValue(n, 'aria-label') === 'Основная навигация'
      ),
    },
    {
      key: 'hamburger',
      match: (n) => n.name === 'button' && (
        getAttrValue(n, 'id') === 'mobile-menu-button' ||
        getAttrValue(n, 'id') === 'rose-burger-btn' ||
        (getAttrValue(n, 'aria-label') === 'Меню' && hasAttr(n, 'aria-expanded'))
      ),
    },
    {
      key: 'logoLink',
      match: (n) => n.name === 'a' && getAttrValue(n, 'href') === '/' && (
        hasAnyClassToken(n, 'flex') || hasAnyClassListToken(n, 'flex') ||
        hasAnyClassToken(n, 'font-comfortaa') ||
        hasAnyClassToken(n, 'shrink-0')
      ),
    },
    {
      key: 'logoImg',
      match: (n) => n.name === 'img' && (
        hasAnyClassToken(n, 'h-5') ||
        hasAnyClassToken(n, 'h-[var(--size-logo-width,24px)]') ||
        hasAnyClassToken(n, 'h-[var(--size-logo-width)]')
      ),
    },
    {
      key: 'logoText',
      match: (n) => {
        // Текущая база: <span class="text-lg sm:text-xl ... tracking-wide">
        if (n.name === 'span' && hasAnyClassToken(n, 'tracking-wide')) return true;
        // rose источник: <a href="/" class="font-comfortaa text-[20px]"> — текст это сам <a>
        // Это уже логолинк. Не считаем чтобы не было дубля.
        return false;
      },
    },
    {
      key: 'navMenu',
      match: (n) => n.name === 'div' && hasAttr(n, 'data-nav-inline') && !hasAnyClassToken(n, 'mt-2'),
    },
    {
      key: 'navLink',
      match: (n) => n.name === 'a' && (
        hasAnyClassToken(n, 'xl:text-[20px]') ||
        hasAnyClassListToken(n, 'text-[length:var(--size-nav-link)]') ||
        // rose источник — навигационные <a> внутри <nav aria-label="Основная навигация">
        hasAnyClassListToken(n, 'font-manrope')
      ),
    },
    {
      key: 'actionSearch',
      match: (n) => (n.name === 'button' || n.name === 'a') && (
        getAttrValue(n, 'aria-label') === 'Поиск' &&
        // Только desktop иконка поиска. На источнике rose это `data-action="toggle-search"`.
        (getAttrValue(n, 'data-action') === 'search' ||
         getAttrValue(n, 'data-action') === 'toggle-search' ||
         hasAnyClassToken(n, 'md:flex'))
      ),
    },
    {
      key: 'actionCart',
      match: (n) => (n.name === 'a' || n.name === 'button') && (
        getAttrValue(n, 'id') === 'header-cart-link' ||
        getAttrValue(n, 'data-action') === 'cart' ||
        hasAttr(n, 'data-cart-open')
      ),
    },
    {
      key: 'cartBadge',
      match: (n) => n.name === 'span' && (
        getAttrValue(n, 'id') === 'cart-badge' ||
        hasAttr(n, 'data-cart-count')
      ),
    },
    {
      key: 'actionProfile',
      match: (n) => n.name === 'a' && (
        getAttrValue(n, 'aria-label') === 'Аккаунт' ||
        getAttrValue(n, 'aria-label') === 'Профиль'
      ),
    },
    {
      key: 'mobileMenuRoot',
      match: (n) => n.name === 'div' && (
        getAttrValue(n, 'id') === 'mobile-menu' ||
        getAttrValue(n, 'id') === 'rose-burger'
      ),
    },
  ],
};

/**
 * Парсит Astro-файл и возвращает { ast, classMap }.
 * classMap: { [elementKey]: { staticClass: string, classList: string[] } }
 *
 * staticClass — содержимое `class="..."` атрибута (если есть)
 * classList — массив строковых литералов из `class:list={[...]}` (только безусловных)
 */
export async function parseAstroFile(source, { selectors, blockName }) {
  if (!selectors) {
    throw new Error(`Нет карты элементов для блока «${blockName}». Добавь BLOCK_ELEMENT_SELECTORS.${blockName} в scripts/lib/astro-parse.mjs.`);
  }

  const result = await parse(source);
  const ast = result.ast;
  const classMap = {};
  // Первое совпадение по каждому ключу — не дублируем (legacy дублирует по layout).
  const seen = new Set();

  walkAst(ast, (node) => {
    for (const { key, match } of selectors) {
      if (seen.has(key)) continue;
      try {
        if (match(node)) {
          classMap[key] = collectClassesFromNode(node);
          seen.add(key);
          return;
        }
      } catch {
        /* ignore selector errors */
      }
    }
  });

  // Заполнить элементы которые не нашлись
  for (const { key } of selectors) {
    if (!classMap[key]) classMap[key] = { staticClass: '', classList: [], found: false };
    else classMap[key].found = true;
  }

  return { ast, classMap };
}

export function walkAst(node, visit) {
  if (!node) return;
  visit(node);
  if (Array.isArray(node.children)) {
    for (const c of node.children) walkAst(c, visit);
  }
}

export function getAttr(node, name) {
  if (!Array.isArray(node.attributes)) return null;
  return node.attributes.find((a) => a.name === name) || null;
}

export function getAttrValue(node, name) {
  const attr = getAttr(node, name);
  if (!attr) return null;
  return typeof attr.value === 'string' ? attr.value : '';
}

export function hasAttr(node, name) {
  return getAttr(node, name) !== null;
}

/** Поиск токена внутри `class="..."` атрибута. */
export function hasClassToken(node, token) {
  const cls = getAttrValue(node, 'class');
  if (!cls) return false;
  return ` ${cls} `.includes(` ${token} `);
}

/** Поиск токена внутри литералов `class:list={[...]}`. */
export function hasClassListToken(node, token) {
  const attr = getAttr(node, 'class:list');
  if (!attr) return false;
  const literals = extractStringLiterals(typeof attr.value === 'string' ? attr.value : '');
  for (const lit of literals) {
    if (` ${lit} `.includes(` ${token} `)) return true;
  }
  return false;
}

/** Поиск в обеих формах. */
export function hasAnyClassToken(node, token) {
  return hasClassToken(node, token) || hasClassListToken(node, token);
}

/** Alias для совместимости с старыми селекторами. */
export function hasAnyClassListToken(node, token) {
  return hasClassListToken(node, token);
}

/**
 * Собрать классы с узла: { staticClass, classList[] }.
 * classList — только безусловные литералы.
 */
export function collectClassesFromNode(node) {
  const staticAttr = getAttr(node, 'class');
  const listAttr = getAttr(node, 'class:list');
  const staticClass = staticAttr && typeof staticAttr.value === 'string'
    ? staticAttr.value.trim()
    : '';
  const classList = [];
  if (listAttr && typeof listAttr.value === 'string') {
    const u = collectUnconditionalLiterals(listAttr.value);
    classList.push(...u);
  }
  return { staticClass, classList };
}

export function extractStringLiterals(text) {
  const out = [];
  // Регулярка по статичным строкам '...', "...", `...` (без подстановок ${})
  const re = /(['"])((?:[^'"\\]|\\.)*?)\1/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m[2]);
  }
  return out;
}

/**
 * Из `[ 'foo', cond && 'bar', y ? 'baz' : 'qux', 'always' ]` — взять только
 * безусловные литералы (foo, always). Условные (bar/baz/qux) — отбросить.
 */
export function collectUnconditionalLiterals(text) {
  const out = [];
  const re = /(['"])((?:[^'"\\]|\\.)*?)\1/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const litStart = m.index;
    // Найти первый non-whitespace символ слева
    let i = litStart - 1;
    while (i >= 0 && /\s/.test(text[i])) i--;
    if (i < 0) { out.push(m[2]); continue; }
    const prev = text[i];
    // Безусловные: после `[`, `,` или ничего
    if (prev === '[' || prev === ',') {
      out.push(m[2]);
    }
    // После `&&` или `?` или `:` — условный, пропускаем
  }
  return out;
}

/**
 * Объединить все классы (static + classList) одной строкой.
 */
export function flattenClasses({ staticClass, classList }) {
  const parts = [];
  if (staticClass) parts.push(staticClass);
  for (const l of classList) parts.push(l);
  return parts.join(' ').split(/\s+/).filter(Boolean);
}
