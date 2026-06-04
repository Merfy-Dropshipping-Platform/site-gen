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

  // ── Hero ────────────────────────────────────────────────────────────────
  // Покрывает оба источника:
  //   1) База theme-base/blocks/Hero/Hero.astro — variants centered/split/overlay/grid-4/split-bloom + carousel mode.
  //      Маркеры: <section data-puck-component-id+data-variant>, <h1>, <p>, <a class={C.ctaButton}>,
  //      <img class={C.image[variant]}>, <header class="flex flex-col gap-1 ...">,
  //      обёртка контента <div class:list=[..., 'flex flex-col gap-4 ...']> и контейнер C.container.
  //   2) Источник rose-theme/src/components/sections/Hero.astro — overlay-style стейдж:
  //      <section aria-labelledby="hero-title">, <div class="relative w-full min-h-[...]"> — стейдж,
  //      <RosePicture> → <img class="absolute inset-0 z-0 size-full object-cover ...">,
  //      <div class="absolute inset-0 z-10 flex w-full flex-col items-center justify-end ..."> — overlay,
  //      <div class="flex w-full max-w-[540px] flex-col items-center gap-6 ..."> — content column,
  //      <div class="flex flex-col items-center gap-2 text-center ..."> — header,
  //      <h1 id="hero-title">, <p>, <a> с !bg-white.
  //
  // Совпадения по ключам ↔ Hero.classes.ts:
  //   root, container, header, title, subtitle, ctaButton, image
  //   (и контент/overlay/stage слои — они частично выражены inline и через variant-specific подклассы).
  Hero: [
    {
      key: 'root',
      // Базовый <section> — корневой стейдж. У базы class:list=[C.root, ...],
      // у rose <section class="relative w-full overflow-hidden bg-white" aria-labelledby="hero-title">.
      match: (n) => n.name === 'section' && (
        hasAttr(n, 'data-puck-component-id') ||
        getAttrValue(n, 'aria-labelledby') === 'hero-title' ||
        // База без id (preview) — fallback: section с overflow-hidden+w-full.
        (hasAnyClassToken(n, 'relative') && hasAnyClassToken(n, 'overflow-hidden') && hasAnyClassToken(n, 'w-full'))
      ),
    },
    {
      key: 'stage',
      // База: первый <div> внутри overlay/centered variant — слой с фоновым изображением + контентом.
      // У базы это часть class:list через inner[variant]; чаще всего находится через
      // div с class содержащим 'absolute inset-0 bg-cover bg-center'.
      // У rose stage — <div class="relative w-full min-h-[min(70svh,560px)] sm:min-h-[560px] ...">.
      match: (n) => n.name === 'div' && (
        // rose: уникальный stage с min-h-* и aspect-* в одной строке.
        (hasAnyClassToken(n, 'min-h-[min(70svh,560px)]')) ||
        (hasAnyClassToken(n, 'aspect-[10/15]') && hasAnyClassToken(n, 'relative')) ||
        // База: stage = слой с background-image (variant=overlay).
        (hasAnyClassToken(n, 'absolute') && hasAnyClassToken(n, 'bg-cover') && hasAnyClassToken(n, 'bg-center'))
      ),
    },
    {
      key: 'container',
      // База: <div class:list={[C.container, innerClass, vAlignClass, 'relative z-10']}>.
      // C.container = 'mx-auto max-w-[var(--container-max-width)] px-4'.
      // rose: contentовая обёртка верхнего уровня с max-w + центрированием. В rose такого слоя нет —
      // используется stage + overlay, поэтому здесь key совпадает только с базой.
      match: (n) => n.name === 'div' && (
        hasAnyClassToken(n, 'max-w-[var(--container-max-width)]') ||
        hasAnyClassListToken(n, 'mx-auto')
      ),
    },
    {
      key: 'overlay',
      // База: variant=centered/overlay рендерит <div class="absolute inset-0 -z-[5]" style=overlay>.
      // rose: контентный слой <div class="absolute inset-0 z-10 flex w-full flex-col items-center justify-end ...">.
      // Маркер: div с inset-0 (полное наложение) и z-10/z-* контентного позиционирования.
      match: (n) => n.name === 'div' && hasAnyClassToken(n, 'absolute') && (
        // rose контентный overlay со специальной комбинацией классов:
        (hasAnyClassToken(n, 'inset-0') && hasAnyClassToken(n, 'z-10') && hasAnyClassToken(n, 'justify-end')) ||
        // База: затемняющий слой (variant centered)
        (hasAnyClassToken(n, 'inset-0') && hasAnyClassToken(n, '-z-[5]'))
      ),
    },
    {
      key: 'contentColumn',
      // База: <div class:list={[..., 'flex flex-col gap-4 sm:gap-5 md:gap-6 ... w-full px-4 sm:px-6 md:px-8', ...]}>.
      // rose: <div class="flex w-full max-w-[540px] flex-col items-center gap-6 sm:gap-10 md:max-w-[640px]">.
      match: (n) => n.name === 'div' && hasAnyClassListToken(n, 'flex flex-col gap-4 sm:gap-5 md:gap-6 lg:gap-5 xl:gap-[25px] w-full px-4 sm:px-6 md:px-8') ||
        (n.name === 'div' &&
         hasAnyClassToken(n, 'flex') && hasAnyClassToken(n, 'flex-col') && (
           hasAnyClassToken(n, 'max-w-[540px]') ||
           hasAnyClassToken(n, 'max-w-[640px]')
         )),
    },
    {
      key: 'header',
      // База: <header class="flex flex-col gap-1 sm:gap-2 md:gap-3 lg:gap-4 xl:gap-[5px]">.
      // rose: <div class="flex flex-col items-center gap-2 text-center sm:gap-3 md:gap-4"> — фактически
      // выполняет ту же роль обёртки h1+p, но это <div>. Допускаем оба тега.
      match: (n) => (n.name === 'header' || (n.name === 'div' && hasAnyClassToken(n, 'items-center') && hasAnyClassToken(n, 'text-center') && hasAnyClassToken(n, 'flex-col'))) &&
        hasAnyClassToken(n, 'gap-2') || hasAnyClassToken(n, 'gap-1') ||
        (n.name === 'header'),
    },
    {
      key: 'title',
      // <h1> — заголовок Hero. В rose у него id="hero-title", в базе data-puck-subsection-field="heading".
      match: (n) => n.name === 'h1' && (
        getAttrValue(n, 'id') === 'hero-title' ||
        getAttrValue(n, 'data-puck-subsection-field') === 'heading' ||
        hasAnyClassListToken(n, '[font-family:var(--font-heading)]')
      ),
    },
    {
      key: 'subtitle',
      // <p> сразу после h1, текстовый подзаголовок.
      // База: class={C.subtitle} = 'mt-2 [font-family:var(--font-body)] text-[length:var(--hero-text-size,16px)] ...'.
      // rose: class="hero-animate-2 max-w-xl px-1 font-manrope text-[14px] font-normal leading-none text-white sm:text-[16px] ...".
      match: (n) => n.name === 'p' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'text' ||
        hasAnyClassListToken(n, '[font-family:var(--font-body)]') ||
        (hasAnyClassToken(n, 'font-manrope') && hasAnyClassToken(n, 'max-w-xl'))
      ),
    },
    {
      key: 'ctaButton',
      // База: <a class={C.ctaButton} ...> с data-puck-subsection-field="primaryButton".
      // rose: <a href={ctaLink} class="inline-flex h-10 min-h-10 w-auto min-w-[120px] ... !bg-white ... !text-[#000000]">.
      match: (n) => n.name === 'a' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'primaryButton' ||
        // База C.ctaButton (часть class:list — литерал виден через hasAnyClassListToken)
        hasAnyClassListToken(n, 'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)]') ||
        // rose CTA — уникально по !bg-white + min-w-[120px]
        (hasAnyClassToken(n, 'inline-flex') && hasAnyClassToken(n, '!bg-white') && hasAnyClassToken(n, 'min-w-[120px]'))
      ),
    },
    {
      key: 'image',
      // База: <img class={C.image[variant]}>. У rose используется компонент <RosePicture>
      // который раскрывается в <img class="absolute inset-0 z-0 size-full object-cover object-center">.
      // Маркер: img с absolute+inset-0 (background-fill в overlay) или с rose-specific size-full.
      match: (n) => n.name === 'img' && (
        // rose specific
        (hasAnyClassToken(n, 'size-full') && hasAnyClassToken(n, 'object-cover')) ||
        // База centered/overlay image
        (hasAnyClassToken(n, 'absolute') && hasAnyClassToken(n, 'inset-0') && hasAnyClassToken(n, 'object-cover'))
      ),
    },
  ],

  // ── Collections ────────────────────────────────────────────────────────
  // Покрывает оба источника:
  //   1) База theme-base/blocks/Collections/Collections.astro:
  //        <section class:list={[C.root, schemeClass]} data-puck-component-id>,
  //        <div class={C.container}>,
  //        <h2 class:list={[C.heading, ...]} data-puck-subsection-field="title">,
  //        <p class:list={[C.subtitle, ...]} data-puck-subsection-field="subtitle">,
  //        <div class:list={[C.grid, gridResponsiveClass]}>,
  //        <a class:list={[C.card, ...]} data-puck-subsection-field="collections">,
  //        <img class:list={[..., C.image+gridAspectClass]}>,
  //        <h3 class:list={[..., C.cardHeading]}>,
  //        <p class:list={[C.cardDescription, ...]}>.
  //   2) Источник rose-theme/src/components/sections/Collections.astro (с раскрытыми
  //      NtSectionHeading и RoseCollectionCard):
  //        <section id="collections" aria-labelledby="collections-title">,
  //        <div class="mx-auto flex w-full max-w-[1320px] flex-col gap-8 md:gap-10">,
  //        <div data-nt="section-heading"> (обёртка заголовка),
  //        <h2 id="collections-title" class="text-center font-comfortaa ... !text-[20px]">,
  //        <p class="text-center font-manrope ... !text-[16px] ... text-[#999999]">,
  //        <ul role="list" class="grid grid-cols-1 ... md:grid-cols-3">,
  //        <a data-nt="rose-collection-card" class="group flex w-full ... flex-col gap-5">,
  //        <div class="aspect-[430/500] w-full overflow-hidden rounded-[8px] bg-[#F5F5F5]"> (cardImageWrapper),
  //        <img class="h-full w-full object-cover ..."> (через RosePicture),
  //        <h3 class="rose-collection-name w-full text-left font-manrope !text-[16px] ...">.
  //
  // Совпадения по ключам ↔ Collections.classes.ts:
  //   root, container, heading, subtitle, grid, card, cardImageWrapper,
  //   image (cardImage), cardHeading, cardDescription.
  Collections: [
    {
      key: 'root',
      // База: <section data-puck-component-id ... class:list=[C.root, ...]>.
      // rose: <section id="collections" aria-labelledby="collections-title">.
      match: (n) => n.name === 'section' && (
        hasAttr(n, 'data-puck-component-id') ||
        getAttrValue(n, 'id') === 'collections' ||
        getAttrValue(n, 'aria-labelledby') === 'collections-title' ||
        // База C.root содержит bg-[rgb(var(--color-bg))]
        hasAnyClassListToken(n, 'relative w-full bg-[rgb(var(--color-bg))]')
      ),
    },
    {
      key: 'container',
      // База: <div class={C.container}> ('mx-auto max-w-[var(--container-max-width)] px-4').
      // rose: <div class="mx-auto flex w-full max-w-[1320px] flex-col gap-8 md:gap-10">.
      match: (n) => n.name === 'div' && (
        hasAnyClassToken(n, 'max-w-[var(--container-max-width)]') ||
        // rose уникальный маркер контейнера блока — max-w-[1320px] на div с mx-auto
        (hasAnyClassToken(n, 'mx-auto') && hasAnyClassToken(n, 'max-w-[1320px]') && hasAnyClassToken(n, 'flex-col'))
      ),
    },
    {
      key: 'heading',
      // База: <h2 class:list={[C.heading, ...]} data-puck-subsection-field="title">.
      // rose: <h2 id="collections-title" class="text-center font-comfortaa ...">.
      // C.heading содержит '[font-family:var(--font-heading)] tracking-[0.1em] uppercase'.
      match: (n) => n.name === 'h2' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'title' ||
        getAttrValue(n, 'id') === 'collections-title' ||
        hasAnyClassListToken(n, '[font-family:var(--font-heading)]') ||
        (hasAnyClassToken(n, 'font-comfortaa') && hasAnyClassToken(n, 'uppercase'))
      ),
    },
    {
      key: 'subtitle',
      // База: <p class:list={[C.subtitle, ...]} data-puck-subsection-field="subtitle">.
      // C.subtitle содержит '[font-family:var(--font-body)] text-[rgb(var(--color-text))]/60'.
      // rose: <p class="text-center font-manrope ... text-[#999999]">.
      match: (n) => n.name === 'p' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'subtitle' ||
        hasAnyClassListToken(n, '[font-family:var(--font-body)]') ||
        (hasAnyClassToken(n, 'font-manrope') && hasAnyClassToken(n, 'text-[#999999]'))
      ),
    },
    {
      key: 'grid',
      // База: <div class:list={[C.grid, gridResponsiveClass]}>.
      // C.grid содержит 'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]'.
      // rose: <ul role="list" class="grid grid-cols-1 ... md:grid-cols-3 ...">.
      match: (n) => (n.name === 'div' || n.name === 'ul') && (
        // База: класс начинается с 'grid' и содержит CSS var для gap
        hasAnyClassListToken(n, 'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]') ||
        // rose: <ul role="list"> с grid grid-cols-1 + md:grid-cols-3
        (n.name === 'ul' && getAttrValue(n, 'role') === 'list' && hasAnyClassToken(n, 'grid') && hasAnyClassToken(n, 'grid-cols-1'))
      ),
    },
    {
      key: 'card',
      // База: <a class:list={[C.card, ...]} data-puck-subsection-field="collections">.
      // C.card = 'block overflow-hidden group'.
      // rose: <a data-nt="rose-collection-card" class="group flex w-full cursor-pointer flex-col gap-5">.
      match: (n) => n.name === 'a' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'collections' ||
        getAttrValue(n, 'data-nt') === 'rose-collection-card' ||
        // База C.card как class:list литерал
        hasAnyClassListToken(n, 'block overflow-hidden group')
      ),
    },
    {
      key: 'cardImageWrapper',
      // База в текущем виде не имеет отдельной <div> обёртки для изображения —
      // <img> рендерится прямо. Когда image отсутствует — используется <div>
      // плейсхолдер с rounded-[var(--radius-media)] и bg-[rgb(var(--color-muted)/0.15)].
      // rose: <div class="aspect-[430/500] w-full overflow-hidden rounded-[8px] bg-[#F5F5F5]">.
      match: (n) => n.name === 'div' && hasAnyClassToken(n, 'overflow-hidden') && (
        // rose specific: aspect-[430/500] + rounded-[8px]
        (hasAnyClassToken(n, 'aspect-[430/500]') && hasAnyClassToken(n, 'rounded-[8px]')) ||
        // База placeholder для пустой коллекции:
        // 'w-full rounded-[var(--radius-media)] bg-[rgb(var(--color-muted)/0.15)] ...'
        (hasAnyClassListToken(n, 'w-full rounded-[var(--radius-media)] bg-[rgb(var(--color-muted)/0.15)]'))
      ),
    },
    {
      key: 'image',
      // База: <img class:list={[..., C.image+gridAspectClass, ...]}>.
      // C.image содержит 'w-full aspect-[3/4] object-cover rounded-[var(--radius-media)]'.
      // rose: <img class="h-full w-full object-cover ..."> (через RosePicture).
      match: (n) => n.name === 'img' && (
        // База: aspect-[3/4] + object-cover как литералы class:list
        hasAnyClassListToken(n, 'w-full aspect-[3/4] object-cover rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))]') ||
        // rose: h-full w-full object-cover в одной строке
        (hasAnyClassToken(n, 'h-full') && hasAnyClassToken(n, 'w-full') && hasAnyClassToken(n, 'object-cover'))
      ),
    },
    {
      key: 'cardHeading',
      // База: <h3 class:list={[..., C.cardHeading, cardCaptionClass]}>.
      // C.cardHeading = 'mt-3 [font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-heading))] text-center'.
      // rose: <h3 class="rose-collection-name w-full text-left font-manrope !text-[16px] ... text-[#000000]">.
      match: (n) => n.name === 'h3' && (
        // База C.cardHeading литералы
        hasAnyClassListToken(n, 'mt-3 [font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-heading))] text-center') ||
        // rose специфичный класс
        hasAnyClassToken(n, 'rose-collection-name') ||
        // rose fallback: font-manrope в карточке коллекции
        (hasAnyClassToken(n, 'font-manrope') && hasAnyClassToken(n, '!text-[16px]') && hasAnyClassToken(n, 'text-[#000000]'))
      ),
    },
    {
      key: 'cardDescription',
      // База: <p class:list={[C.cardDescription, ...]}>. Опциональный элемент,
      // показывается только если у коллекции есть item.description.
      // C.cardDescription = 'mt-1 text-[12px] leading-[15px] [font-family:var(--font-body)] text-[rgb(var(--color-text))]/60 text-center'.
      // rose: этот элемент отсутствует — карточка содержит только h3.
      match: (n) => n.name === 'p' &&
        hasAnyClassListToken(n, 'mt-1 text-[12px] leading-[15px] [font-family:var(--font-body)] text-[rgb(var(--color-text))]/60 text-center'),
    },
  ],

  // ── PopularProducts ────────────────────────────────────────────────────
  // Покрывает оба источника:
  //   1) База theme-base/blocks/PopularProducts/PopularProducts.astro + PopularProductRichCard.astro:
  //        <section data-block="popular-products" data-puck-component-id>,
  //        <div class={C.container}>,
  //        <h2 class={C.heading}> + <p class={C.subtitle}>,
  //        <div data-pop-grid> (grid),
  //        minimal-вариант: <div class={C.card} data-product-index> с <div class={C.cardMedia}>
  //          и <span class={C.cardBadgeNew}>, <img>, <div class={C.cardTitle}>,
  //          <div class={C.cardPrice}>, <div class={C.cardOldPrice}>, <button class={C.cardCta}>,
  //          <span class={C.swatchOverlay.container}>;
  //        rich-вариант: <PopularProductRichCard> → <div data-popular-card-rich> с <a> на media,
  //          <div data-popular-badges> badges (фон bg-[rgb(var(--color-accent))]),
  //          <div data-popular-colors> swatches, <a> title, <span> price/oldPrice,
  //          <div data-popular-memory> chips, <button data-popular-cta>.
  //   2) Источник rose-theme/src/components/sections/Popular.astro + products/RoseProductCard.astro:
  //        <section id="popular" aria-labelledby="popular-title">,
  //        <div class="mx-auto flex w-full max-w-[1320px] flex-col gap-8 md:gap-10">,
  //        <NtSectionHeading> → <h2 id="popular-title">+<p>,
  //        <ul role="list" class="grid">,
  //        <article data-nt="rose-product-card"> с <a> на aspect-[318/444],
  //          <RosePicture> → <img class="h-full w-full object-cover ...">,
  //          <span> badge "Скидка", <a class="rose-product-name">,
  //          <span class="rose-product-price">, <span class="rose-product-oldprice">.
  //
  // Совпадения по ключам ↔ PopularProducts.classes.ts:
  //   root, container, heading, subtitle, grid,
  //   card, cardMedia, cardImage,
  //   cardBadge (sale/new badge — общий маркер),
  //   cardTitle, cardPrice, cardOldPrice, cardCta,
  //   swatchOverlayContainer (только база — у rose нет swatch-overlay в карточке).
  PopularProducts: [
    {
      key: 'root',
      // База: <section data-block="popular-products"> + data-puck-component-id.
      // rose: <section id="popular" aria-labelledby="popular-title">.
      match: (n) => n.name === 'section' && (
        getAttrValue(n, 'data-block') === 'popular-products' ||
        getAttrValue(n, 'id') === 'popular' ||
        getAttrValue(n, 'aria-labelledby') === 'popular-title' ||
        // База C.root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]'
        hasAnyClassListToken(n, 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]')
      ),
    },
    {
      key: 'container',
      // База: <div class={C.container}> ('mx-auto max-w-[var(--container-max-width)] px-4').
      // rose: <div class="mx-auto flex w-full max-w-[1320px] flex-col gap-8 md:gap-10">.
      match: (n) => n.name === 'div' && (
        hasAnyClassToken(n, 'max-w-[var(--container-max-width)]') ||
        // rose уникальный маркер — max-w-[1320px] на div mx-auto + flex-col
        (hasAnyClassToken(n, 'mx-auto') && hasAnyClassToken(n, 'max-w-[1320px]') && hasAnyClassToken(n, 'flex-col'))
      ),
    },
    {
      key: 'heading',
      // База: <h2 class={C.heading} data-puck-subsection-field="heading">.
      // C.heading = '[font-family:var(--font-heading)] text-[14px] leading-[16px] tracking-[0.1em] uppercase text-[rgb(var(--color-heading))] mb-2'.
      // rose: <h2 id="popular-title" class="font-comfortaa uppercase ...">.
      match: (n) => n.name === 'h2' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'heading' ||
        getAttrValue(n, 'id') === 'popular-title' ||
        hasAnyClassListToken(n, '[font-family:var(--font-heading)]') ||
        (hasAnyClassToken(n, 'font-comfortaa') && hasAnyClassToken(n, 'uppercase'))
      ),
    },
    {
      key: 'subtitle',
      // База: <p class={C.subtitle} data-puck-subsection-field="text">.
      // C.subtitle = '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/60 mb-10'.
      // rose: <p class="font-manrope text-[#999999]"> (внутри NtSectionHeading).
      match: (n) => n.name === 'p' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'text' ||
        hasAnyClassListToken(n, '[font-family:var(--font-body)]') ||
        (hasAnyClassToken(n, 'font-manrope') && hasAnyClassToken(n, 'text-[#999999]'))
      ),
    },
    {
      key: 'grid',
      // База: <div class={C.grid} data-pop-grid>.
      // C.grid = 'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]'.
      // rose: <ul role="list" class="grid grid-cols-2 ... md:grid-cols-3 xl:grid-cols-4">.
      match: (n) => (n.name === 'div' || n.name === 'ul') && (
        hasAttr(n, 'data-pop-grid') ||
        hasAnyClassListToken(n, 'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]') ||
        (n.name === 'ul' && getAttrValue(n, 'role') === 'list' && hasAnyClassToken(n, 'grid') && hasAnyClassToken(n, 'grid-cols-2'))
      ),
    },
    {
      key: 'card',
      // База minimal: <div class={C.card} data-product-index>.
      // C.card = 'flex flex-col gap-3 items-stretch group'.
      // База rich (PopularProductRichCard.astro): <div data-popular-card-rich
      //   class="relative flex flex-col gap-4 p-3 rounded-[12px] w-full bg-[rgb(var(--color-surface))]">.
      // rose RoseProductCard.astro: <article data-nt="rose-product-card" class="group flex w-full flex-col gap-5">.
      match: (n) => (n.name === 'div' || n.name === 'article') && (
        hasAttr(n, 'data-product-index') ||
        hasAttr(n, 'data-popular-card-rich') ||
        getAttrValue(n, 'data-nt') === 'rose-product-card' ||
        // База C.card как class
        hasAnyClassToken(n, 'flex') && hasAnyClassToken(n, 'flex-col') && hasAnyClassToken(n, 'gap-3') && hasAnyClassToken(n, 'items-stretch')
      ),
    },
    {
      key: 'cardMedia',
      // База: <div class={C.cardMedia} aria-hidden="true">.
      // C.cardMedia = 'relative w-full aspect-square rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] overflow-hidden ...'.
      // rich-вариант: <a href={href} class="block aspect-square rounded-[12px] overflow-hidden bg-[rgb(var(--color-text)/0.04)]">.
      // rose: <a href={href} class="relative block aspect-[318/444] w-full overflow-hidden rounded-[8px] bg-white">.
      match: (n) => (n.name === 'div' || n.name === 'a') && (
        // База cardMedia: aspect-square + rounded-[var(--radius-media)]
        (hasAnyClassToken(n, 'aspect-square') && hasAnyClassToken(n, 'overflow-hidden')) ||
        // rose aspect-[318/444]
        (hasAnyClassToken(n, 'aspect-[318/444]') && hasAnyClassToken(n, 'overflow-hidden')) ||
        // База cardMedia из rich-варианта
        (hasAnyClassToken(n, 'block') && hasAnyClassToken(n, 'aspect-square') && hasAnyClassToken(n, 'rounded-[12px]'))
      ),
    },
    {
      key: 'cardImage',
      // База: <img src=... class="absolute inset-0 w-full h-full object-cover">.
      // rose: <RosePicture> → <img class="h-full w-full object-cover transition-transform ...">.
      match: (n) => n.name === 'img' && (
        // База: absolute inset-0 + object-cover
        (hasAnyClassToken(n, 'absolute') && hasAnyClassToken(n, 'inset-0') && hasAnyClassToken(n, 'object-cover')) ||
        // rose / rich: h-full w-full object-cover
        (hasAnyClassToken(n, 'h-full') && hasAnyClassToken(n, 'w-full') && hasAnyClassToken(n, 'object-cover'))
      ),
    },
    {
      key: 'cardBadge',
      // База: <span class={C.cardBadgeNew}> / <span class={C.cardBadgeSale}>.
      // C.cardBadgeNew = 'absolute top-3 left-3 inline-flex ... bg-[rgb(var(--color-button-bg))] ...'.
      // rich-вариант: badge через bg-[rgb(var(--color-accent))] внутри data-popular-badges.
      // rose: <span class="absolute left-3 top-3 z-10 ... bg-[#000000] ... !text-white">Скидка.
      match: (n) => n.name === 'span' && (
        // База cardBadgeNew/Sale: absolute top-3 left-3
        (hasAnyClassToken(n, 'absolute') && hasAnyClassToken(n, 'top-3') && hasAnyClassToken(n, 'left-3') &&
          (hasAnyClassToken(n, 'bg-[rgb(var(--color-button-bg))]') || hasAnyClassToken(n, 'bg-[rgb(var(--color-accent))]'))) ||
        // rose Скидка badge: absolute left-3 top-3 bg-[#000000]
        (hasAnyClassToken(n, 'absolute') && hasAnyClassToken(n, 'left-3') && hasAnyClassToken(n, 'top-3') && hasAnyClassToken(n, 'bg-[#000000]'))
      ),
    },
    {
      key: 'cardTitle',
      // База minimal: <div class={C.cardTitle}>.
      // C.cardTitle = '[font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-heading))]'.
      // База rich: <a class="block [font-family:var(--font-body)] text-[16px] text-[rgb(var(--color-heading))] truncate ...">.
      // rose: <a class="rose-product-name block w-full font-manrope text-[14px] ... text-[#000000]">.
      match: (n) => (n.name === 'div' || n.name === 'a') && (
        // База cardTitle class литерал
        hasAnyClassListToken(n, '[font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-heading))]') ||
        // rose специфичный класс
        hasAnyClassToken(n, 'rose-product-name') ||
        // База rich title: [font-family:var(--font-body)] + text-[rgb(var(--color-heading))] + truncate
        (hasAnyClassToken(n, '[font-family:var(--font-body)]') && hasAnyClassToken(n, 'text-[rgb(var(--color-heading))]') && hasAnyClassToken(n, 'truncate'))
      ),
    },
    {
      key: 'cardPrice',
      // База minimal: <div class={C.cardPrice}>.
      // C.cardPrice = '[font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-text))]'.
      // База rich: <span class="[font-family:var(--font-body)] text-[16px] text-[rgb(var(--color-text))]">.
      // rose: <span class="rose-product-price font-manrope !text-[16px] ... text-[#000000]">.
      match: (n) => (n.name === 'div' || n.name === 'span') && (
        // База cardPrice: точный литерал C.cardPrice
        hasAnyClassListToken(n, '[font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-text))]') ||
        // rose-specific class
        hasAnyClassToken(n, 'rose-product-price') ||
        // База rich price
        (hasAnyClassToken(n, '[font-family:var(--font-body)]') && hasAnyClassToken(n, 'text-[rgb(var(--color-text))]') && hasAnyClassToken(n, 'text-[16px]'))
      ),
    },
    {
      key: 'cardOldPrice',
      // База minimal: <div class={C.cardOldPrice}>.
      // C.cardOldPrice = '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/50 line-through'.
      // База rich: <span class="[font-family:var(--font-body)] text-[14px] text-[rgb(var(--color-text))]/60 line-through">.
      // rose: <span class="rose-product-oldprice font-manrope !text-[14px] ... text-[#999999] line-through">.
      match: (n) => (n.name === 'div' || n.name === 'span') && (
        // База cardOldPrice класс литерал
        hasAnyClassListToken(n, '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/50 line-through') ||
        // rose specific
        hasAnyClassToken(n, 'rose-product-oldprice') ||
        // База rich или общий маркер line-through на тексте товара
        (hasAnyClassToken(n, '[font-family:var(--font-body)]') && hasAnyClassToken(n, 'line-through'))
      ),
    },
    {
      key: 'cardCta',
      // База minimal: <button data-popular-cta class={C.cardCta}>.
      // C.cardCta = 'mt-3 inline-flex h-[44px] items-center justify-center px-4 ... rounded-[var(--radius-button)]
      //   [font-family:var(--font-body)] bg-[rgb(var(--color-button-bg))]! ... border ... hover:bg-[rgb(var(--color-button-bg-hover))]! ...'.
      // База rich: <button data-popular-cta class="w-full inline-flex items-center justify-center h-11 ... rounded-[var(--radius-button)]
      //   [font-family:var(--font-body)] ... bg-[rgb(var(--color-button-bg))]! ... border ... hover:bg-[rgb(var(--color-button-bg-hover))]! ...">.
      // rose: в rose-Popular CTA-кнопки на карточке нет — товар просто <a>. Будет not-found для rose.
      match: (n) => n.name === 'button' && (
        hasAttr(n, 'data-popular-cta') ||
        // База C.cardCta — bg-button-bg + hover:bg-button-bg-hover
        (hasAnyClassToken(n, 'inline-flex') && hasAnyClassToken(n, 'rounded-[var(--radius-button)]') &&
          (hasAnyClassToken(n, 'bg-[rgb(var(--color-button-bg))]!') || hasAnyClassToken(n, 'bg-[rgb(var(--color-button-bg))]')))
      ),
    },
    {
      key: 'swatchOverlayContainer',
      // База minimal: <span class={C.swatchOverlay.container} data-swatch-overlay>.
      // C.swatchOverlay.container = 'absolute bottom-3 right-3 inline-flex gap-1.5 z-10'.
      // rose: swatch-overlay отсутствует — будет not-found.
      match: (n) => n.name === 'span' && (
        hasAttr(n, 'data-swatch-overlay') ||
        hasAnyClassListToken(n, 'absolute bottom-3 right-3 inline-flex gap-1.5 z-10')
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
