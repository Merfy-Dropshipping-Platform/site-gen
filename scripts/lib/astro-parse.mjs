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

  // ── Footer ──────────────────────────────────────────────────────────────
  // Покрывает оба источника:
  //   1) База theme-base/blocks/Footer/Footer.astro — 4 варианта, маркеры:
  //        <footer>, <div class={C.container}>, id="newsletter-heading",
  //        <form data-action="newsletter">, <section aria-label="Информация и навигация">,
  //        <h3 class={C.column.title}>, <a data-platform=...>, <div class={Ccopy.bar}>
  //   2) Источник rose-theme/src/components/Footer.astro — 3-col структура с маркерами:
  //        <footer>, <div class="mx-auto w-full max-w-[1920px] ...">,
  //        id="newsletter-heading", <form data-newsletter-form>,
  //        <section aria-label="Навигация по сайту">,
  //        <ul role="list">, <a aria-label="VK|YouTube|Telegram|...">
  //
  // Совпадения по ключам ↔ Footer.classes.ts:
  //   root, container,
  //   newsletter.{wrapper,inner,copy,heading,description,form,input,submit},
  //   main.{section,grid},
  //   column.{root,title,nav,body}, link, email, socialRow, socialLink,
  //   copyright.{bar,text}
  Footer: [
    {
      key: 'root',
      match: (n) => n.name === 'footer',
    },
    {
      key: 'container',
      match: (n) => n.name === 'div' && (
        hasAnyClassToken(n, 'max-w-[var(--container-max-width)]') ||
        // rose: <div class="mx-auto w-full max-w-[1920px] ...">
        (hasAnyClassToken(n, 'mx-auto') && hasAnyClassToken(n, 'max-w-[1920px]'))
      ),
    },
    {
      key: 'newsletter.wrapper',
      match: (n) => n.name === 'section' &&
        getAttrValue(n, 'aria-labelledby') === 'newsletter-heading',
    },
    {
      key: 'newsletter.inner',
      // База: <div class={C.newsletter.inner}> — обёртка под copy + form внутри
      // секции newsletter. rose-источник эту обёртку не использует (там section
      // прямо содержит copy и form). Будет помечен как не найденный для rose.
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'w-full') &&
        // Защита: parent — секция newsletter (структурный hint через сосед h2)
        // Берём через признак «внутри newsletter» (упрощённо: нет других маркеров).
        // Используем уникальный fingerprint из базы: `w-full` без gap- и без grid.
        !hasAnyClassToken(n, 'grid') &&
        !hasAnyClassToken(n, 'flex'),
    },
    {
      key: 'newsletter.copy',
      // База: <div class={C.newsletter.copy}> ("flex flex-col gap-2")
      // rose: <div class="flex max-w-[1320px] flex-col gap-2 text-left">
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'flex') &&
        hasAnyClassToken(n, 'flex-col') &&
        hasAnyClassToken(n, 'gap-2'),
    },
    {
      key: 'newsletter.heading',
      match: (n) => n.name === 'h2' &&
        getAttrValue(n, 'id') === 'newsletter-heading',
    },
    {
      key: 'newsletter.description',
      // База и rose: <p> сразу за heading в newsletter секции.
      // Уникальный маркер для обоих — параграф с описанием рассылки.
      match: (n) => n.name === 'p' && (
        // База: ничего особо отличительного — берём любой <p> с текстом-like классами
        hasAnyClassToken(n, 'leading-[1.4]') ||
        // rose: <p class="font-manrope ... text-[#999999]">
        (hasAnyClassToken(n, 'font-manrope') && hasAnyClassToken(n, '!leading-none'))
      ),
    },
    {
      key: 'newsletter.form',
      match: (n) => n.name === 'form' && (
        getAttrValue(n, 'data-action') === 'newsletter' ||
        hasAttr(n, 'data-newsletter-form')
      ),
    },
    {
      key: 'newsletter.input',
      match: (n) => n.name === 'input' &&
        getAttrValue(n, 'type') === 'email',
    },
    {
      key: 'newsletter.submit',
      match: (n) => n.name === 'button' &&
        getAttrValue(n, 'type') === 'submit' &&
        getAttrValue(n, 'aria-label') === 'Подписаться',
    },
    {
      key: 'main.section',
      // База: <section aria-label="Информация и навигация">
      // rose: <section aria-label="Навигация по сайту">
      match: (n) => n.name === 'section' && (
        getAttrValue(n, 'aria-label') === 'Информация и навигация' ||
        getAttrValue(n, 'aria-label') === 'Навигация по сайту'
      ),
    },
    {
      key: 'main.grid',
      // База: <div class={Cm.grid}> внутри main.section.
      // rose: основная section сама использует flex flex-col gap-10 lg:flex-row.
      // Маркер: первый flex/grid div внутри main.section.
      match: (n) => n.name === 'div' && (
        // База: typical grid-like
        (hasAnyClassToken(n, 'md:flex-row') && hasAnyClassToken(n, 'md:items-start')) ||
        // rose: <div class="flex flex-col gap-10 sm:flex-row sm:gap-[200px]">
        (hasAnyClassToken(n, 'flex') && hasAnyClassToken(n, 'sm:flex-row') && hasAnyClassToken(n, 'gap-10'))
      ),
    },
    {
      key: 'column.root',
      // База: <div class={C.column.root}> — обёртка колонки nav/info/social.
      // rose: <ul class="flex flex-col gap-3" role="list"> — выступает как
      // обёртка колонки. Берём первое совпадение (nav-колонка).
      match: (n) => (n.name === 'div' || n.name === 'ul') && (
        // База column.root: 'flex flex-col gap-4 flex-1 min-w-0 max-w-[318px]'
        (hasAnyClassToken(n, 'flex-col') && hasAnyClassToken(n, 'max-w-[318px]')) ||
        // rose: <ul class="flex flex-col gap-3" role="list">
        (n.name === 'ul' && getAttrValue(n, 'role') === 'list')
      ),
    },
    {
      key: 'column.title',
      // База: <h3 class={C.column.title}>. rose-источник не использует
      // заголовки колонок → элемент будет not-found для rose.
      match: (n) => n.name === 'h3',
    },
    {
      key: 'column.nav',
      // База: <nav class={C.column.nav}> aria-label="Footer navigation"
      match: (n) => n.name === 'nav' &&
        getAttrValue(n, 'aria-label') === 'Footer navigation',
    },
    {
      key: 'column.body',
      // База: <div class={C.column.body}> ("flex flex-col gap-3") —
      // обёртка под информационные ссылки или контакты.
      // rose: контактная колонка <div class="flex flex-col gap-3"> внутри
      // правой колонки (line 114).
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'flex') &&
        hasAnyClassToken(n, 'flex-col') &&
        hasAnyClassToken(n, 'gap-3'),
    },
    {
      key: 'link',
      // База: <a class={C.link}> в nav-колонке. rose: <a class="font-manrope ...">
      // внутри <li> навигационной <ul>.
      match: (n) => n.name === 'a' && (
        // База link: 'text-[16px] text-[rgb(var(--color-muted))]'
        (hasAnyClassToken(n, 'text-[16px]') && hasAnyClassToken(n, 'transition-colors')) ||
        // rose: 'font-manrope !text-[16px] ... text-[#999999]'
        (hasAnyClassToken(n, 'font-manrope') && hasAnyClassToken(n, '!text-[16px]'))
      ),
    },
    {
      key: 'email',
      // База: <a class={C.email} href={`mailto:...`}>
      // rose: <a href={`mailto:${email}`} class="font-manrope ...">
      match: (n) => n.name === 'a' && (() => {
        const href = getAttrValue(n, 'href');
        return typeof href === 'string' && href.includes('mailto:');
      })(),
    },
    {
      key: 'socialRow',
      // База: <div class={C.socialRow}> с дочерними <a data-platform=...>.
      // rose: <div class="flex flex-wrap items-center gap-2 lg:justify-end">
      // с дочерними <a aria-label="VK|YouTube|...">.
      // Маркер: div, у которого есть ребёнок <a aria-label> с социальной платформой.
      match: (n) => n.name === 'div' && Array.isArray(n.children) && n.children.some((c) =>
        c && c.name === 'a' && (
          hasAttr(c, 'data-platform') ||
          ['VK', 'YouTube', 'YandexDzen', 'TikTok', 'Telegram'].includes(getAttrValue(c, 'aria-label') || '')
        ),
      ),
    },
    {
      key: 'socialLink',
      match: (n) => n.name === 'a' && (
        hasAttr(n, 'data-platform') ||
        ['VK', 'YouTube', 'YandexDzen', 'TikTok', 'Telegram'].includes(getAttrValue(n, 'aria-label') || '')
      ),
    },
    {
      key: 'copyright.bar',
      // База: <div class={Ccopy.bar}> в конце footer ("w-full h-auto sm:h-20 ... bg-[rgb(var(--color-heading))]").
      // rose: <div class="flex h-16 w-full items-center justify-center bg-black px-4">
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'w-full') &&
        hasAnyClassToken(n, 'items-center') &&
        hasAnyClassToken(n, 'justify-center') && (
          hasAnyClassToken(n, 'bg-[rgb(var(--color-heading))]') ||
          hasAnyClassToken(n, 'bg-black')
        ),
    },
    {
      key: 'copyright.text',
      // База: <p class={Ccopy.text}>. rose: <p class="text-center font-manrope text-[14px] ... text-white">
      match: (n) => n.name === 'p' &&
        hasAnyClassToken(n, 'text-center') && (
          hasAnyClassToken(n, 'leading-[1.21]') ||
          (hasAnyClassToken(n, 'font-manrope') && hasAnyClassToken(n, 'text-white'))
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
