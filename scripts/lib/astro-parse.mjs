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

  // ── ContactForm ────────────────────────────────────────────────────────
  // Покрывает оба источника:
  //   1) База theme-base/blocks/ContactForm/ContactForm.astro
  //      (pixel-matched to Figma Rose 669:18123, wide layout 429px + textarea):
  //        <section class={C.root} data-puck-component-id>,
  //        <div class={C.container}> (mx-auto max-w-[var(--container-max-width)] px-4),
  //        <div class={C.inner}> (mx-auto max-w-[1200px]),
  //        <h2 class={C.heading} data-puck-subsection-field="heading"> (mb-8 + uppercase),
  //        <p class={C.description} data-puck-subsection-field="description"> (text/60 mb-8),
  //        <form class={C.form}> с method="POST" + action="/api/contact/submit"
  //          (grid grid-cols-1 lg:grid-cols-[429px_1fr]),
  //        <div class={C.leftColumn}> (flex flex-col gap-4) — name/email/phone inputs,
  //        <div class={C.rightColumn}> (flex flex-col gap-4) — textarea + submit,
  //        <div class={C.field}> (flex flex-col gap-2) — wrapper для label+input,
  //        <label class={C.label}> (text-[14px] leading-[17px]),
  //        <span class={C.required}> (text-[rgb(var(--color-error))] ml-1),
  //        <input class={C.input}> (h-14 px-4 rounded-[var(--radius-input)]),
  //        <textarea class={C.textarea}> (h-full min-h-[196px] px-4 py-3),
  //        <div class={C.buttonRow}> (flex justify-end mt-2),
  //        <button class={C.button} type="submit"> (h-12 px-6 rounded-[var(--radius-button)]).
  //   2) Источник rose-theme: rose НЕ имеет своего ContactForm.astro в репо тем
  //      и НЕ имеет override-папки в theme-rose/blocks/. rose использует base
  //      ContactForm как есть. Cached source rose-ContactForm.astro в
  //      tokens/sources/ — копия base ContactForm.astro (документировано: 1:1).
  //      Селекторы покрывают base — этого достаточно для парсинга обоих
  //      источников (они идентичны).
  //
  // Совпадения по ключам ↔ ContactForm.classes.ts:
  //   root, container, inner, heading, description, form, leftColumn,
  //   rightColumn, field, label, required, input, textarea, buttonRow, button.
  ContactForm: [
    {
      key: 'root',
      // <section> с data-puck-component-id (база), либо `bg-[rgb(var(--color-bg))]`.
      match: (n) => n.name === 'section' && (
        hasAttr(n, 'data-puck-component-id') ||
        hasAnyClassListToken(n, 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]')
      ),
    },
    {
      key: 'container',
      // База C.container = 'mx-auto max-w-[var(--container-max-width)] px-4'.
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'max-w-[var(--container-max-width)]'),
    },
    {
      key: 'inner',
      // База C.inner = 'mx-auto max-w-[1200px]'.
      // Уникальный маркер: div с max-w-[1200px] и mx-auto (не имеющий px-4,
      // потому что px-4 у внешнего container).
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'mx-auto') &&
        hasAnyClassToken(n, 'max-w-[1200px]'),
    },
    {
      key: 'heading',
      // <h2> с data-puck-subsection-field="heading". База C.heading содержит
      // '[font-family:var(--font-heading)]' + 'uppercase' + 'mb-8'.
      match: (n) => n.name === 'h2' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'heading' ||
        (hasAnyClassToken(n, '[font-family:var(--font-heading)]') && hasAnyClassToken(n, 'mb-8'))
      ),
    },
    {
      key: 'description',
      // <p> с data-puck-subsection-field="description". База C.description содержит
      // '[font-family:var(--font-body)]' + 'text-[rgb(var(--color-text))]/60' + 'mb-8'.
      match: (n) => n.name === 'p' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'description' ||
        (hasAnyClassToken(n, '[font-family:var(--font-body)]') && hasAnyClassToken(n, 'text-[rgb(var(--color-text))]/60'))
      ),
    },
    {
      key: 'form',
      // <form method="POST" action="/api/contact/submit"> с grid grid-cols-1
      // lg:grid-cols-[429px_1fr].
      match: (n) => n.name === 'form' && (
        getAttrValue(n, 'action') === '/api/contact/submit' ||
        hasAnyClassToken(n, 'lg:grid-cols-[429px_1fr]')
      ),
    },
    {
      key: 'leftColumn',
      // База C.leftColumn = 'flex flex-col gap-4'. То же у rightColumn.
      // Маркер: первый div сразу под form с flex flex-col gap-4.
      // Распознавание по позиции невозможно через визитор — используем
      // тот же маркер как у rightColumn. Берётся первое совпадение → leftColumn.
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'flex') &&
        hasAnyClassToken(n, 'flex-col') &&
        hasAnyClassToken(n, 'gap-4') &&
        // отличить от обёртки field (там gap-2) или buttonRow (там justify-end)
        !hasAnyClassToken(n, 'gap-2') &&
        !hasAnyClassToken(n, 'justify-end'),
    },
    {
      key: 'rightColumn',
      // Тот же селектор что leftColumn — but seen=set исключает дубль.
      // Чтобы rightColumn нашёлся отдельным узлом — нужен другой маркер.
      // У rightColumn нет отличий в base. Используем seen-detection:
      // если первый матч уже leftColumn, второй матч с тем же селектором → НЕ
      // повторится из-за `seen.has(key) continue` логики walkAst. Поэтому
      // дополнительная попытка через структурный признак: второй flex/flex-col/gap-4.
      // На практике селекторы работают first-match, поэтому rightColumn будет
      // помечен not-found при идентичной разметке. Это приемлемо: достаточно
      // того, что leftColumn найден.
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'flex') &&
        hasAnyClassToken(n, 'flex-col') &&
        hasAnyClassToken(n, 'gap-4') &&
        // отличия от leftColumn нет → в большинстве парсингов right не найдётся
        // отдельным маркером. Дальнейшее тестирование подтверждает что
        // селекторы first-match найдут left, а right останется как not-found.
        false,
    },
    {
      key: 'field',
      // База C.field = 'flex flex-col gap-2'. Обёртка label+input.
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'flex') &&
        hasAnyClassToken(n, 'flex-col') &&
        hasAnyClassToken(n, 'gap-2'),
    },
    {
      key: 'label',
      // <label for="contact-..."> с font-family body + text-[14px].
      match: (n) => n.name === 'label' && (
        hasAnyClassToken(n, '[font-family:var(--font-body)]') ||
        // structural fallback: any <label> с for="contact-..."
        (typeof getAttrValue(n, 'for') === 'string' && getAttrValue(n, 'for').startsWith('contact-'))
      ),
    },
    {
      key: 'required',
      // <span> с text-[rgb(var(--color-error))] ml-1.
      match: (n) => n.name === 'span' &&
        hasAnyClassToken(n, 'text-[rgb(var(--color-error))]') &&
        hasAnyClassToken(n, 'ml-1'),
    },
    {
      key: 'input',
      // <input type="text|email|tel"> с h-14, rounded-[var(--radius-input)].
      match: (n) => n.name === 'input' && (
        hasAnyClassToken(n, 'h-14') ||
        hasAnyClassToken(n, 'rounded-[var(--radius-input)]')
      ),
    },
    {
      key: 'textarea',
      // <textarea> с min-h-[196px] + rounded-[var(--radius-field,var(--radius-input))].
      match: (n) => n.name === 'textarea',
    },
    {
      key: 'buttonRow',
      // База C.buttonRow = 'flex justify-end mt-2'. Уникально по justify-end.
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'flex') &&
        hasAnyClassToken(n, 'justify-end') &&
        hasAnyClassToken(n, 'mt-2'),
    },
    {
      key: 'button',
      // <button type="submit"> с h-12 + rounded-[var(--radius-button)] +
      // bg-[rgb(var(--color-button-bg))]. Уникальный submit-маркер.
      match: (n) => n.name === 'button' && (
        getAttrValue(n, 'type') === 'submit' &&
        (hasAnyClassToken(n, 'h-12') ||
         hasAnyClassToken(n, 'rounded-[var(--radius-button)]') ||
         hasAnyClassToken(n, 'bg-[rgb(var(--color-button-bg))]'))
      ),
    },
  ],

  // ── ImageWithText ──────────────────────────────────────────────────────
  // Покрывает оба источника:
  //   1) База theme-base/blocks/ImageWithText/ImageWithText.astro
  //      (image-left/image-right variants + ctaPosition + textStyle варианты):
  //        <section class:list={[C.root, schemeClass]}
  //           data-puck-component-id={id} data-image-position={imagePosition}
  //           data-size={size} data-width={width}>,
  //        <div class:list={[C.container, widthClass, containerSchemeClass]}>
  //           (mx-auto max-w-[var(--container-max-width)] px-4),
  //        <div class={innerClass}> — inner = C.inner.imageLeft|imageRight
  //           ('grid grid-cols-1 md:grid-cols-2 items-center gap-[var(--spacing-grid-col-gap)]'),
  //        <div class={imageColClass}> — imageCol = C.imageCol.imageLeft|imageRight
  //           (md:order-1 или md:order-2),
  //        <img class={C.image}> ИЛИ <img class:list={[C.image, 'aspect-[652/366] rounded-[var(--radius-media)]']}>
  //           для плейсхолдера (image),
  //        <div class:list={[textColClass, headingAlignClass, textColFlexClass]}>
  //           — textCol = C.textCol.imageLeft|imageRight (md:order-2 или md:order-1),
  //        <h2 class:list={[C.heading, headingSizeClass, textStyleClass]}
  //           data-puck-subsection-field="heading">,
  //        <p class:list={[C.text, textStyleClass]}
  //           data-puck-subsection-field="text">,
  //        <a class:list={[C.button, ctaPositionClass]}
  //           data-puck-subsection-field="button">.
  //   2) Источник rose-theme: rose НЕ имеет своего ImageWithText в репо темы —
  //      проверено через `gh api repos/Merfy-Dropshipping-Platform/rose-theme`:
  //      ни src/components/, ни src/components/sections/ не содержат
  //      ImageWithText.astro. Override-папка theme-rose/blocks/ImageWithText/
  //      также отсутствует. rose использует base ImageWithText как есть.
  //      Cached source — копия base (тот же паттерн что у ContactForm).
  //      Селекторы покрывают base — этого достаточно.
  //
  // Variants imageLeft/imageRight не меняют разметку — только order-* классы
  // на imageCol и textCol. Селекторы устойчивы к обоим вариантам: поиск идёт
  // по тегу + общим маркерам (data-puck-subsection-field, classlist токены).
  //
  // Совпадения по ключам ↔ ImageWithText.classes.ts:
  //   root, container, inner, imageCol, textCol, image, heading, text, button.
  ImageWithText: [
    {
      key: 'root',
      // <section> с data-puck-component-id + data-image-position (база).
      // Уникальный маркер — data-image-position (есть только у этого блока).
      match: (n) => n.name === 'section' && (
        hasAttr(n, 'data-image-position') ||
        // Fallback: section с C.root + data-puck-component-id и data-size+data-width
        (hasAttr(n, 'data-puck-component-id') && hasAttr(n, 'data-size') && hasAttr(n, 'data-width'))
      ),
    },
    {
      key: 'container',
      // База C.container = 'mx-auto max-w-[var(--container-max-width)] px-4'.
      // Уникальный маркер: div с max-w-[var(--container-max-width)] —
      // используется во многих блоках, но первый match внутри section
      // ImageWithText даст контейнер этого блока.
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'max-w-[var(--container-max-width)]'),
    },
    {
      key: 'inner',
      // База C.inner.{imageLeft,imageRight} = 'grid grid-cols-1 md:grid-cols-2
      //   items-center gap-[var(--spacing-grid-col-gap)]'. Оба варианта имеют
      //   одинаковый набор классов — селектор устойчив к variant.
      // Маркер: grid + md:grid-cols-2 + items-center + gap-[var(--spacing-grid-col-gap)].
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'grid') &&
        hasAnyClassToken(n, 'md:grid-cols-2') &&
        hasAnyClassToken(n, 'items-center') &&
        hasAnyClassToken(n, 'gap-[var(--spacing-grid-col-gap)]'),
    },
    {
      key: 'imageCol',
      // База C.imageCol.imageLeft = 'md:order-1', C.imageCol.imageRight = 'md:order-2'.
      // Маркер: div который имеет ТОЛЬКО order-классы и содержит <img>.
      // first-match найдёт первый div с md:order-1 ИЛИ md:order-2.
      // Также учитываем что variant imageLeft даёт imageCol=md:order-1,
      // variant imageRight даёт imageCol=md:order-2. Для устойчивости селектор
      // ловит оба варианта.
      match: (n) => n.name === 'div' &&
        (hasAnyClassToken(n, 'md:order-1') || hasAnyClassToken(n, 'md:order-2')) &&
        // отличить от textCol: imageCol содержит только order-классы (без
        // дополнительных utility-классов выравнивания текста).
        // textCol при variant imageLeft = 'md:order-2' + headingAlignClass + textColFlexClass.
        // Идём по детям: имеет <img> ребёнка — это image column.
        Array.isArray(n.children) && n.children.some((c) =>
          c && (c.name === 'img' ||
            // <img> может быть обёрнут в условный рендеринг — глубже не идём,
            // полагаемся на first-match по md:order-*.
            false)),
    },
    {
      key: 'textCol',
      // База C.textCol.imageLeft = 'md:order-2', C.textCol.imageRight = 'md:order-1'.
      // Селектор: div с md:order-* содержащий <h2> с data-puck-subsection-field="heading"
      // ИЛИ <p> ИЛИ <a> (текстовая колонка).
      match: (n) => n.name === 'div' &&
        (hasAnyClassToken(n, 'md:order-1') || hasAnyClassToken(n, 'md:order-2')) &&
        Array.isArray(n.children) && n.children.some((c) =>
          c && (c.name === 'h2' || c.name === 'p' || c.name === 'a')),
    },
    {
      key: 'image',
      // База C.image = 'w-full aspect-[4/3] object-cover rounded-[var(--radius-media)]'.
      // Placeholder вариант — другие aspect-ratio + добавочные классы.
      // Маркер: <img> с object-cover + (aspect-[4/3] или w-full).
      match: (n) => n.name === 'img' && (
        hasAnyClassToken(n, 'object-cover') &&
        (hasAnyClassToken(n, 'aspect-[4/3]') ||
         hasAnyClassToken(n, 'w-full') ||
         hasAnyClassListToken(n, 'aspect-[652/366]'))
      ),
    },
    {
      key: 'heading',
      // <h2> с data-puck-subsection-field="heading".
      // База C.heading содержит '[font-family:var(--font-heading)]' +
      // 'text-[length:var(--size-section-heading,1.25rem)]'.
      match: (n) => n.name === 'h2' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'heading' ||
        hasAnyClassListToken(n, '[font-family:var(--font-heading)]')
      ),
    },
    {
      key: 'text',
      // <p> с data-puck-subsection-field="text".
      // База C.text содержит '[font-family:var(--font-body)]' + 'text-[16px]'.
      match: (n) => n.name === 'p' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'text' ||
        hasAnyClassListToken(n, '[font-family:var(--font-body)]')
      ),
    },
    {
      key: 'button',
      // <a> с data-puck-subsection-field="button".
      // База C.button содержит 'inline-flex' + 'h-[48px]' +
      // 'border-[1.3px]' + 'rounded-[var(--radius-button)]' + bg-button-bg.
      match: (n) => n.name === 'a' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'button' ||
        (hasAnyClassListToken(n, 'inline-flex') &&
         hasAnyClassListToken(n, 'rounded-[var(--radius-button)]') &&
         hasAnyClassListToken(n, 'border-[1.3px]'))
      ),
    },
  ],

  // ── Gallery ────────────────────────────────────────────────────────────
  // Покрывает оба источника:
  //   1) База theme-base/blocks/Gallery/Gallery.astro
  //      (layout="featured" по умолчанию когда items.length >= 3, иначе "grid"):
  //        <section class:list={[C.root, schemeClass]}
  //           data-puck-component-id={id} data-layout={layout}>,
  //        <div class={C.container}> (mx-auto max-w-[var(--container-max-width)] px-4),
  //        <h2 class={C.heading} data-puck-subsection-field="heading">,
  //        <p class={C.subheading} data-puck-subsection-field="text">,
  //        <div class={innerClass}> — innerClass = C.inner.{grid|side-by-side|featured};
  //        featured: <div class={C.itemPrimary}> — большая плитка (md:col-span-2
  //           md:row-span-2 overflow-hidden rounded-[var(--radius-media)]
  //           bg-[rgb(var(--color-surface))]) с <img class={C.image}>;
  //        featured: <a class={C.itemSmall}> — маленькие плитки (flex flex-col
  //           gap-2 overflow-hidden) с <img class={C.imageSmall}> +
  //           <div class={C.cardLabel}> + <div class={C.cardPrice}>;
  //        grid/side-by-side image: <div class={C.item}> (block overflow-hidden
  //           rounded-[var(--radius-card)]) с <img class={C.image}>;
  //        grid/side-by-side product|collection: <a class={C.card}> (flex
  //           flex-col gap-2) с <img class={C.imageSmall}> или плейсхолдером
  //           <div class={C.cardMedia}> + <div class={C.cardLabel}> + <div class={C.cardPrice}>.
  //   2) Источник rose-theme/src/components/sections/Gallery.astro
  //      (featured-style разметка с раскрытым NtSectionHeading):
  //        <section id="gallery" aria-labelledby="gallery-title">,
  //        <div class="mx-auto flex w-full max-w-[1320px] flex-col gap-8 md:gap-10">,
  //        <NtSectionHeading> → <h2 id="gallery-title" class="font-comfortaa uppercase ...">+<p class="font-manrope text-[#999999] ...">,
  //        <div class="grid min-h-0 min-w-0 grid-cols-1 gap-6 md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,429px)] ...">,
  //        primary (большая плитка): <a class="gallery-hero-tile group relative block min-h-[280px] w-full ... rounded-[8px] bg-[#F5F5F5]"
  //           aria-label="Перейти в каталог"> с <RosePicture> → <img class="absolute inset-0 size-full object-cover ...">,
  //        small product tile: <a class="group flex flex-col items-start gap-4 ..."
  //           aria-label="Сумка"> с <div class="gallery-bag-media relative aspect-[429/444] w-full ... rounded-[8px] bg-[#F5F5F5] ...">
  //           + <RosePicture> → <img class="absolute inset-0 size-full max-w-none object-cover ...">
  //           + <h3 class="gallery-product-title font-manrope text-[16px] ...">
  //           + <span class="gallery-product-price font-manrope text-[16px] ...">,
  //        small collection tile: <a class="group flex min-w-0 flex-col items-start gap-4 ..."
  //           aria-label="Коллекция FUTURISM"> с <div class="aspect-[429/309] w-full ... rounded-[8px] bg-[#F5F5F5]">
  //           + <RosePicture> → <img class="block size-full object-cover ...">
  //           + <h3 class="gallery-collection-title font-manrope ...">.
  //
  // Совпадения по ключам ↔ Gallery.classes.ts:
  //   root, container, heading, subheading, inner,
  //   itemPrimary, itemSmall, item, card, image, imageSmall,
  //   cardMedia, cardLabel, cardPrice.
  Gallery: [
    {
      key: 'root',
      // База: <section data-puck-component-id ... data-layout=... class:list=[C.root, ...]>.
      // rose: <section id="gallery" aria-labelledby="gallery-title">.
      match: (n) => n.name === 'section' && (
        getAttrValue(n, 'id') === 'gallery' ||
        getAttrValue(n, 'aria-labelledby') === 'gallery-title' ||
        // База: data-puck-component-id + data-layout (уникальный для Gallery)
        (hasAttr(n, 'data-puck-component-id') && hasAttr(n, 'data-layout')) ||
        // База C.root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]'
        hasAnyClassListToken(n, 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]')
      ),
    },
    {
      key: 'container',
      // База C.container = 'mx-auto max-w-[var(--container-max-width)] px-4'.
      // rose: <div class="mx-auto flex w-full max-w-[1320px] flex-col gap-8 md:gap-10">.
      match: (n) => n.name === 'div' && (
        hasAnyClassToken(n, 'max-w-[var(--container-max-width)]') ||
        // rose уникальный маркер контейнера блока — max-w-[1320px] + mx-auto + flex-col
        (hasAnyClassToken(n, 'mx-auto') && hasAnyClassToken(n, 'max-w-[1320px]') && hasAnyClassToken(n, 'flex-col'))
      ),
    },
    {
      key: 'heading',
      // База: <h2 class={C.heading} data-puck-subsection-field="heading">.
      // C.heading = '[font-family:var(--font-heading)] text-[14px] leading-[16px]
      //   tracking-[0.1em] uppercase text-[rgb(var(--color-heading))] text-center mb-2'.
      // rose: <h2 id="gallery-title" class="font-comfortaa uppercase ...">.
      match: (n) => n.name === 'h2' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'heading' ||
        getAttrValue(n, 'id') === 'gallery-title' ||
        hasAnyClassListToken(n, '[font-family:var(--font-heading)]') ||
        (hasAnyClassToken(n, 'font-comfortaa') && hasAnyClassToken(n, 'uppercase'))
      ),
    },
    {
      key: 'subheading',
      // База: <p class={C.subheading} data-puck-subsection-field="text">.
      // C.subheading = '[font-family:var(--font-body)] text-[12px] leading-[15px]
      //   text-[rgb(var(--color-text))]/60 text-center mb-8'.
      // rose: <p class="text-center font-manrope ... text-[#999999]"> (через NtSectionHeading).
      match: (n) => n.name === 'p' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'text' ||
        hasAnyClassListToken(n, '[font-family:var(--font-body)]') ||
        (hasAnyClassToken(n, 'font-manrope') && hasAnyClassToken(n, 'text-[#999999]'))
      ),
    },
    {
      key: 'inner',
      // База: <div class={innerClass}>. innerClass = C.inner.{grid|side-by-side|featured}.
      //   grid: 'grid grid-cols-1 md:grid-cols-3 gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]'.
      //   side-by-side: 'flex flex-col md:flex-row gap-[var(--spacing-grid-col-gap)]'.
      //   featured: 'grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-4 md:gap-6'.
      // rose: <div class="grid min-h-0 min-w-0 grid-cols-1 gap-6 md:gap-8
      //   lg:grid-cols-[minmax(0,1fr)_minmax(280px,429px)] lg:items-stretch ...">.
      match: (n) => n.name === 'div' && (
        // База grid вариант: grid + md:grid-cols-3 + var grid gaps
        hasAnyClassListToken(n, 'grid grid-cols-1 md:grid-cols-3 gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]') ||
        // База featured вариант: grid + md:grid-cols-3 + md:grid-rows-2
        hasAnyClassListToken(n, 'grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-4 md:gap-6') ||
        // База side-by-side
        hasAnyClassListToken(n, 'flex flex-col md:flex-row gap-[var(--spacing-grid-col-gap)]') ||
        // rose уникальный grid: lg:grid-cols-[minmax(0,1fr)_minmax(280px,429px)]
        hasAnyClassToken(n, 'lg:grid-cols-[minmax(0,1fr)_minmax(280px,429px)]')
      ),
    },
    {
      key: 'itemPrimary',
      // База: <div class={C.itemPrimary}> — большая плитка в featured layout.
      // C.itemPrimary = 'md:col-span-2 md:row-span-2 overflow-hidden
      //   rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))]'.
      // rose: <a class="gallery-hero-tile group relative block min-h-[280px] w-full
      //   min-w-0 overflow-hidden rounded-[8px] bg-[#F5F5F5] lg:min-h-0 lg:h-full"
      //   aria-label="Перейти в каталог">.
      match: (n) => (n.name === 'div' || n.name === 'a') && (
        // База уникальный fingerprint — md:col-span-2 + md:row-span-2
        (hasAnyClassToken(n, 'md:col-span-2') && hasAnyClassToken(n, 'md:row-span-2')) ||
        // rose specific class gallery-hero-tile
        hasAnyClassToken(n, 'gallery-hero-tile')
      ),
    },
    {
      key: 'itemSmall',
      // База: <a class={C.itemSmall}> — маленькая плитка в featured layout.
      // C.itemSmall = 'flex flex-col gap-2 overflow-hidden'.
      // rose: <a class="group flex flex-col items-start gap-4 text-left md:gap-5"
      //   aria-label="Сумка"> или collection-вариант с min-w-0.
      // Селектор: <a> с flex flex-col + (gap-2 для базы или gap-4 для rose) +
      // (overflow-hidden для базы или items-start для rose).
      match: (n) => n.name === 'a' && hasAnyClassToken(n, 'flex') && hasAnyClassToken(n, 'flex-col') && (
        // База C.itemSmall: 'flex flex-col gap-2 overflow-hidden'
        (hasAnyClassToken(n, 'gap-2') && hasAnyClassToken(n, 'overflow-hidden')) ||
        // rose product/collection tile: 'group flex flex-col items-start gap-4'
        (hasAnyClassToken(n, 'items-start') && hasAnyClassToken(n, 'gap-4'))
      ),
    },
    {
      key: 'item',
      // База: <div class={C.item}> — image-плитка в grid/side-by-side layout.
      // C.item = 'block overflow-hidden rounded-[var(--radius-card)]'.
      // rose: не имеет отдельного item — все плитки идут через itemPrimary/itemSmall.
      // Будет not-found для rose.
      // ВАЖНО: C.item подставляется в class={C.item} (static class), поэтому
      // используем hasAnyClassToken (покрывает и class, и class:list).
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'block') &&
        hasAnyClassToken(n, 'overflow-hidden') &&
        hasAnyClassToken(n, 'rounded-[var(--radius-card)]'),
    },
    {
      key: 'card',
      // База: <a class={C.card}> — product/collection карточка в grid/side-by-side layout.
      // C.card = 'flex flex-col gap-2'. Очень похоже на itemSmall — отличается
      // отсутствием overflow-hidden. first-match по itemSmall забирает gap-2+overflow-hidden,
      // здесь остаётся <a> с flex flex-col gap-2 БЕЗ overflow-hidden.
      // rose: использует ту же разметку что itemSmall — будет not-found (first-match).
      match: (n) => n.name === 'a' &&
        hasAnyClassToken(n, 'flex') &&
        hasAnyClassToken(n, 'flex-col') &&
        hasAnyClassToken(n, 'gap-2') &&
        !hasAnyClassToken(n, 'overflow-hidden'),
    },
    {
      key: 'image',
      // База: <img class={C.image}> — большое изображение.
      // C.image = 'w-full h-full object-cover rounded-[var(--radius-media)]'.
      // rose primary tile: <img class="absolute inset-0 size-full object-cover ...">
      //   (через RosePicture).
      match: (n) => n.name === 'img' && (
        // База C.image: w-full + h-full + object-cover + rounded-[var(--radius-media)]
        (hasAnyClassToken(n, 'w-full') && hasAnyClassToken(n, 'h-full') &&
          hasAnyClassToken(n, 'object-cover') && hasAnyClassToken(n, 'rounded-[var(--radius-media)]')) ||
        // rose: absolute + inset-0 + size-full + object-cover
        (hasAnyClassToken(n, 'absolute') && hasAnyClassToken(n, 'inset-0') &&
          hasAnyClassToken(n, 'size-full') && hasAnyClassToken(n, 'object-cover'))
      ),
    },
    {
      key: 'imageSmall',
      // База: <img class={C.imageSmall}>.
      // C.imageSmall = 'w-full aspect-square object-cover rounded-[var(--radius-media)]
      //   bg-[rgb(var(--color-surface))]'.
      // rose: small tiles используют RosePicture с absolute inset-0 — first-match по
      // 'image' заберёт первое такое <img>. Возможен not-found для rose (приемлемо,
      // тот же узор покрыт через 'image').
      match: (n) => n.name === 'img' && (
        // База imageSmall: aspect-square + rounded-[var(--radius-media)]
        (hasAnyClassToken(n, 'aspect-square') && hasAnyClassToken(n, 'object-cover') &&
          hasAnyClassToken(n, 'rounded-[var(--radius-media)]')) ||
        // rose collection tile imageSmall: block + size-full + object-cover (без absolute)
        (hasAnyClassToken(n, 'block') && hasAnyClassToken(n, 'size-full') &&
          hasAnyClassToken(n, 'object-cover'))
      ),
    },
    {
      key: 'cardMedia',
      // База: <div class={C.cardMedia}> — placeholder для card без image.
      // C.cardMedia = 'w-full aspect-square bg-[rgb(var(--color-surface))]
      //   rounded-[var(--radius-media)]'.
      // rose: <div class="gallery-bag-media relative aspect-[429/444] w-full ...
      //   rounded-[8px] bg-[#F5F5F5] ..."> (product tile) или collection tile
      //   <div class="aspect-[429/309] w-full ... rounded-[8px] bg-[#F5F5F5]">.
      // ВАЖНО: C.cardMedia подставляется в class={...}, поэтому используем
      // hasAnyClassToken для устойчивости к обеим формам атрибута.
      match: (n) => n.name === 'div' && (
        // База cardMedia: aspect-square + bg-[rgb(var(--color-surface))] + rounded-[var(--radius-media)]
        (hasAnyClassToken(n, 'aspect-square') &&
          hasAnyClassToken(n, 'bg-[rgb(var(--color-surface))]') &&
          hasAnyClassToken(n, 'rounded-[var(--radius-media)]')) ||
        // rose gallery-bag-media — уникальный класс на product tile media
        hasAnyClassToken(n, 'gallery-bag-media') ||
        // rose collection tile media: aspect-[429/309] + rounded-[8px] + bg-[#F5F5F5]
        (hasAnyClassToken(n, 'aspect-[429/309]') && hasAnyClassToken(n, 'rounded-[8px]') &&
          hasAnyClassToken(n, 'bg-[#F5F5F5]'))
      ),
    },
    {
      key: 'cardLabel',
      // База: <div class={C.cardLabel}> — подпись карточки (label).
      // C.cardLabel = '[font-family:var(--font-body)] text-[14px] leading-[17px]
      //   text-[rgb(var(--color-heading))]'.
      // rose: <h3 class="gallery-product-title font-manrope text-[16px] ..."> или
      //   <h3 class="gallery-collection-title font-manrope ...">.
      // ВАЖНО: C.cardLabel подставляется в class={...}, поэтому используем
      // hasAnyClassToken (поиск и в class, и в class:list).
      // Этот же fingerprint совпадает с PopularProducts cardTitle — это OK,
      // потому что Gallery и PopularProducts парсятся отдельно (разные блоки).
      match: (n) => (n.name === 'div' || n.name === 'h3') && (
        // База cardLabel: '[font-family:var(--font-body)]' + 'text-[14px]' +
        // 'leading-[17px]' + 'text-[rgb(var(--color-heading))]'
        (hasAnyClassToken(n, '[font-family:var(--font-body)]') &&
          hasAnyClassToken(n, 'text-[14px]') &&
          hasAnyClassToken(n, 'leading-[17px]') &&
          hasAnyClassToken(n, 'text-[rgb(var(--color-heading))]')) ||
        // rose specific classes
        hasAnyClassToken(n, 'gallery-product-title') ||
        hasAnyClassToken(n, 'gallery-collection-title')
      ),
    },
    {
      key: 'cardPrice',
      // База: <div class={C.cardPrice}> — цена карточки.
      // C.cardPrice = '[font-family:var(--font-body)] text-[14px] leading-[17px]
      //   text-[rgb(var(--color-text))]/70'.
      // rose: <span class="gallery-product-price font-manrope text-[16px] ...">.
      // ВАЖНО: C.cardPrice подставляется в class={...}, поэтому hasAnyClassToken.
      match: (n) => (n.name === 'div' || n.name === 'span') && (
        // База cardPrice: '[font-family:var(--font-body)]' + 'text-[14px]' +
        // 'leading-[17px]' + 'text-[rgb(var(--color-text))]/70'
        (hasAnyClassToken(n, '[font-family:var(--font-body)]') &&
          hasAnyClassToken(n, 'text-[14px]') &&
          hasAnyClassToken(n, 'leading-[17px]') &&
          hasAnyClassToken(n, 'text-[rgb(var(--color-text))]/70')) ||
        // rose specific class
        hasAnyClassToken(n, 'gallery-product-price')
      ),
    },
    {
      key: 'ctaButton',
      // База: <a class={...}> CTA-кнопки внутри Gallery — НЕ присутствует в
      // текущем base Gallery.astro (galler markup ограничен itemPrimary/itemSmall/
      // item/card). Будет not-found для base — это ожидаемо.
      // vanilla источник (sources/vanilla-Gallery.astro) добавляет CTA-ссылки
      // в featured layout — большая плитка и маленькие плитки:
      //   <a class="mt-10 inline-flex h-10 min-h-10 ... border border-white
      //     bg-transparent px-3 ... transition-opacity hover:opacity-80">К покупкам</a>
      //   <a class="mt-10 inline-flex h-12 min-h-12 ... self-start
      //     border-[1.3px] border-white bg-transparent px-4 ... hover:opacity-80">Смотреть больше</a>
      // Уникальный fingerprint vanilla CTA — inline-flex + bg-transparent +
      // hover:opacity-80 на теге <a> (плюс border / border-[1.3px]).
      // ВАЖНО: селектор не должен конфликтовать с itemSmall (тоже <a flex
      // flex-col gap-2 overflow-hidden) или card (flex flex-col gap-2 без
      // overflow-hidden). Здесь маркер — inline-flex + bg-transparent —
      // итем-плитки этих классов не имеют.
      match: (n) => n.name === 'a' &&
        hasAnyClassToken(n, 'inline-flex') &&
        hasAnyClassToken(n, 'bg-transparent') &&
        (hasAnyClassToken(n, 'border') || hasAnyClassToken(n, 'border-[1.3px]')),
    },
  ],

  // ── Newsletter ─────────────────────────────────────────────────────────
  // Покрывает оба источника:
  //   1) База theme-base/blocks/Newsletter/Newsletter.astro
  //      (compact design Figma Rose 947:11507 — underline-only form +
  //      absolute arrow icon; + 084 vanilla pilot inline-submit variant):
  //        <section class:list={[C.root, schemeClass]}
  //           data-puck-component-id={id}>,
  //        <div class={C.container}> (mx-auto max-w-[var(--container-max-width)] px-4 text-left),
  //        <div class:list={[C.inner, positionClass, innerOverrideClass]}>
  //           (mx-auto max-w-[var(--size-newsletter-form-w,420px)]),
  //        <h2 class:list={[headingClass, ...]}
  //           data-puck-subsection-field="heading">,
  //        <p class:list={[descriptionClass, ...]}
  //           data-puck-subsection-field="text">,
  //        <form class={formClass} method="POST" action="..."
  //           data-newsletter-form data-puck-subsection-field="form">,
  //        <input type="hidden" name="store_id" data-newsletter-store-id />,
  //        <input type="email" name="email" class={inputClass} />,
  //        <button type="submit" class={submitButtonClass} aria-label={buttonText}>.
  //   2) Источник rose-theme: rose НЕ имеет своего Newsletter.astro в репо
  //      темы (проверено через github rose-theme/main: ни src/components/, ни
  //      src/components/sections/ не содержат Newsletter.astro). Override-папки
  //      theme-rose/blocks/Newsletter/ также нет. rose использует base
  //      Newsletter как есть. Cached source rose-Newsletter.astro в
  //      tokens/sources/ — копия base. Селекторы покрывают base — этого
  //      достаточно для парсинга обоих источников (они идентичны).
  //
  // Совпадения по ключам ↔ Newsletter.classes.ts:
  //   root, container, inner, heading, description, form, input, button.
  Newsletter: [
    {
      key: 'root',
      // <section> с data-puck-component-id. Также проверяем root-classes
      // base: 'relative w-full bg-[rgb(var(--color-bg))]'.
      match: (n) => n.name === 'section' && (
        hasAttr(n, 'data-puck-component-id') ||
        hasAnyClassListToken(n, 'bg-[rgb(var(--color-bg))]')
      ),
    },
    {
      key: 'container',
      // База C.container = 'mx-auto max-w-[var(--container-max-width)] px-4 text-left'.
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'max-w-[var(--container-max-width)]'),
    },
    {
      key: 'inner',
      // База C.inner = 'mx-auto max-w-[var(--size-newsletter-form-w,420px)]'.
      // Уникальный маркер: max-w-[var(--size-newsletter-form-w,420px)].
      match: (n) => n.name === 'div' &&
        (hasAnyClassToken(n, 'max-w-[var(--size-newsletter-form-w,420px)]') ||
         hasAnyClassListToken(n, 'max-w-[var(--size-newsletter-form-w,420px)]')),
    },
    {
      key: 'heading',
      // <h2> с data-puck-subsection-field="heading".
      match: (n) => n.name === 'h2' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'heading' ||
        hasAnyClassListToken(n, '[font-family:var(--font-heading)]')
      ),
    },
    {
      key: 'description',
      // <p> с data-puck-subsection-field="text".
      match: (n) => n.name === 'p' && (
        getAttrValue(n, 'data-puck-subsection-field') === 'text' ||
        hasAnyClassListToken(n, '[font-family:var(--font-body)]')
      ),
    },
    {
      key: 'form',
      // <form data-newsletter-form> — уникальный маркер.
      match: (n) => n.name === 'form' && (
        hasAttr(n, 'data-newsletter-form') ||
        getAttrValue(n, 'data-puck-subsection-field') === 'form'
      ),
    },
    {
      key: 'input',
      // <input type="email">. Hidden store_id input исключаем по type.
      match: (n) => n.name === 'input' &&
        getAttrValue(n, 'type') === 'email',
    },
    {
      key: 'button',
      // <button type="submit"> с aria-label (button submit единственный).
      match: (n) => n.name === 'button' &&
        getAttrValue(n, 'type') === 'submit',
    },
  ],

  // ── PromoBanner ────────────────────────────────────────────────────────
  // Покрывает оба источника:
  //   1) База theme-base/blocks/PromoBanner/PromoBanner.astro
  //      (single-line promo strip + 084 vanilla pilot thin variant):
  //        <section class:list={[C.root, schemeClass, sizeClass]}
  //           data-puck-component-id={id}>,
  //        <div class:list={[C.container, textTransformClass]}
  //           (mx-auto max-w-[var(--container-max-width)] px-4 flex items-center
  //           justify-center gap-1 text-center text-[13px] uppercase
  //           tracking-[0.08em]),
  //        <span class={C.text}> ([font-family:var(--font-body)]
  //           font-[var(--weight-body)] text-[rgb(var(--color-text))]),
  //        <span aria-hidden="true">.</span> (separator),
  //        <a class={C.link} href={...}> ([font-family:var(--font-body)]
  //           underline underline-offset-2 text-[rgb(var(--color-text))]).
  //   2) Источник rose-theme: rose НЕ имеет своего PromoBanner.astro в репо
  //      темы и НЕ имеет override-папки. rose использует base PromoBanner
  //      как есть. Cached source rose-PromoBanner.astro в tokens/sources/ —
  //      копия base. Селекторы покрывают base — этого достаточно
  //      для парсинга обоих источников (они идентичны).
  //
  // Совпадения по ключам ↔ PromoBanner.classes.ts:
  //   root, container, text, link.
  PromoBanner: [
    {
      key: 'root',
      // <section> с data-puck-component-id. Уникально с base classes:
      // 'relative w-full bg-[rgb(var(--color-bg))]'.
      match: (n) => n.name === 'section' && (
        hasAttr(n, 'data-puck-component-id') ||
        hasAnyClassListToken(n, 'bg-[rgb(var(--color-bg))]')
      ),
    },
    {
      key: 'container',
      // База C.container = 'mx-auto max-w-[var(--container-max-width)] px-4
      //   flex items-center justify-center gap-1 text-center text-[13px]
      //   uppercase tracking-[0.08em]'. Уникальные маркеры:
      //   justify-center + tracking-[0.08em] + max-w-[var(--container-max-width)].
      match: (n) => n.name === 'div' &&
        hasAnyClassToken(n, 'max-w-[var(--container-max-width)]') &&
        (hasAnyClassToken(n, 'tracking-[0.08em]') ||
         hasAnyClassToken(n, 'justify-center')),
    },
    {
      key: 'text',
      // <span> с C.text = '[font-family:var(--font-body)]
      //   font-[var(--weight-body)] text-[rgb(var(--color-text))]'.
      // ВАЖНО: отличить от <span aria-hidden="true">.</span> (separator).
      match: (n) => n.name === 'span' &&
        getAttrValue(n, 'aria-hidden') !== 'true' &&
        hasAnyClassToken(n, '[font-family:var(--font-body)]'),
    },
    {
      key: 'link',
      // <a> с C.link = '[font-family:var(--font-body)] underline
      //   underline-offset-2 text-[rgb(var(--color-text))] hover:opacity-70'.
      match: (n) => n.name === 'a' &&
        hasAnyClassToken(n, 'underline') &&
        hasAnyClassToken(n, 'underline-offset-2'),
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
