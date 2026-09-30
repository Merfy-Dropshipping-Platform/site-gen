/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Сидеры страниц аккаунта: профиль, избранное, заказы, вход.
 */

import type { Block, PageData } from './types';
import { getHomeChrome } from './shared-chrome';

/**
 * Пункт 14: страница «Профиль» (личный кабинет покупателя, «Основные данные»).
 *
 * Страница витрины существовала и раньше — `themes/<t>/src/pages/account/
 * profile.astro` во всех пяти темах, live отдаёт 200, превью конструктора по
 * `?page=account/profile` тоже. Не было только записи страницы, поэтому пункта
 * в верхнем меню конструктора не появлялось. Манифест темы её теперь объявляет,
 * но `runMigrations` домерживает страницы манифеста лишь при подъёме ревизии с
 * 1.0 → 2.0; у всех живых сайтов ревизия уже 2.0, поэтому запись добавляем
 * здесь — тем же приёмом, что `seedCheckoutResultPage`.
 *
 * Содержимое — РОВНО [Header, Footer]. Тело страницы verbatim (приходит из
 * собранной темы), Puck-блоков у него нет; шапка и подвал доезжают инъекцией
 * хрома и потому реально настраиваются. Класть сюда секцию «Страница» нельзя:
 * её правки не отразились бы ни в превью, ни на витрине — это мёртвая настройка.
 *
 * Идемпотентна: страница с уже существующей записью/контентом не трогается.
 */
export function seedProfilePage(out: Record<string, unknown>): Record<string, unknown> {
  // Пустая ревизия (без pagesData вовсе) — не сайт, а заглушка: у новых сайтов
  // страницы приходят из манифеста темы. Не создаём pagesData на ровном месте,
  // иначе `migrateRevisionData({})` перестаёт быть тождественным преобразованием.
  if (!out.pagesData || typeof out.pagesData !== 'object') return out;
  const pagesData = out.pagesData as Record<string, unknown>;
  const pages = Array.isArray(out.pages)
    ? (out.pages as Array<{ id?: string; slug?: string }>)
    : [];
  const hasContent = !!pagesData['page-profile'];
  const hasMeta = pages.some(
    (p) =>
      p?.id === 'page-profile' ||
      (p?.slug ?? '').replace(/^\/+|\/+$/g, '') === 'account/profile',
  );
  if (hasContent && hasMeta) return out;

  // b45-fix: детерминированные id (не Date.now()) — см. коммент у
  // getHomeChrome. Совпадает с сидом theme.json (`Header-profile`/`Footer-profile`).
  const chrome = getHomeChrome(pagesData);
  const newPagesData = hasContent
    ? pagesData
    : {
        ...pagesData,
        'page-profile': {
          // Свои id — Puck ломается на дубликатах между страницами.
          content: [
            { ...chrome.headerBlock, props: { ...(chrome.headerBlock.props ?? {}), id: 'Header-profile' } },
            { ...chrome.footerBlock, props: { ...(chrome.footerBlock.props ?? {}), id: 'Footer-profile' } },
          ],
          root: { props: { meta: { title: 'Основные данные' } } },
          zones: {},
        } as PageData,
      };
  const newPages = hasMeta
    ? pages
    : [
        ...pages,
        {
          id: 'page-profile',
          name: 'Профиль',
          slug: '/account/profile',
          role: 'system',
          contentFile: 'pages/profile.json',
        },
      ];
  return { ...out, pages: newPages, pagesData: newPagesData };
}

/**
 * Страница «Избранное» (`/wishlist`) — тестировщик 14.09: «Для страницы
 * Избранное в блоке Тема создать исключительно там секцию Избранное».
 *
 * Страница витрины существовала и раньше (`themes/<t>/src/pages/wishlist.astro`
 * во всех пяти темах, live отдаёт 200), но записи страницы у ревизии не было —
 * значит не было ни пункта в меню конструктора, ни возможности настроить её
 * секции. Манифест темы её теперь объявляет, но `runMigrations` домерживает
 * страницы манифеста только при подъёме ревизии 1.0 → 2.0; у живых сайтов
 * ревизия уже 2.0, поэтому запись досеваем здесь — тем же приёмом, что
 * `seedProfilePage`.
 *
 * Содержимое — [Header, WishlistSection, Footer]: тело страницы это ОДНА
 * секция «Избранное» (порт темы), вокруг мерчант добавляет свои секции, как на
 * главной. Шапка и подвал берутся у главной (getHomeChrome), собственные id —
 * Puck ломается на дубликатах между страницами.
 *
 * Идемпотентна: страница с уже существующей записью И контентом не трогается,
 * поэтому правки мерчанта (схема, отступы, добавленные секции) переживают
 * любой повторный прогон.
 */
export function seedWishlistPage(out: Record<string, unknown>): Record<string, unknown> {
  // Пустая ревизия (без pagesData вовсе) — не сайт, а заглушка: у новых сайтов
  // страницы приходят из манифеста темы. Не создаём pagesData на ровном месте,
  // иначе `migrateRevisionData({})` перестаёт быть тождественным преобразованием.
  if (!out.pagesData || typeof out.pagesData !== 'object') return out;
  const pagesData = out.pagesData as Record<string, unknown>;
  const pages = Array.isArray(out.pages)
    ? (out.pages as Array<{ id?: string; slug?: string }>)
    : [];
  const hasContent = !!pagesData['page-wishlist'];
  const hasMeta = pages.some(
    (p) =>
      p?.id === 'page-wishlist' ||
      (p?.slug ?? '').replace(/^\/+|\/+$/g, '') === 'wishlist',
  );
  if (hasContent && hasMeta) return out;

  // b45-fix: детерминированные id (не Date.now()) — см. коммент у
  // getHomeChrome. Совпадает с сидом theme.json.
  const chrome = getHomeChrome(pagesData);
  const newPagesData = hasContent
    ? pagesData
    : {
        ...pagesData,
        'page-wishlist': {
          content: [
            { ...chrome.headerBlock, props: { ...(chrome.headerBlock.props ?? {}), id: 'Header-wishlist' } },
            {
              type: 'WishlistSection',
              props: {
                id: 'WishlistSection-1',
                colorScheme: 2,
                padding: { top: 80, bottom: 80 },
              },
            },
            { ...chrome.footerBlock, props: { ...(chrome.footerBlock.props ?? {}), id: 'Footer-wishlist' } },
          ],
          root: { props: { title: 'Избранное' } },
          zones: {},
        } as PageData,
      };
  const newPages = hasMeta
    ? pages
    : [
        ...pages,
        {
          id: 'page-wishlist',
          name: 'Избранное',
          slug: '/wishlist',
          role: 'system',
          contentFile: 'pages/wishlist.json',
        },
      ];
  return { ...out, pages: newPages, pagesData: newPagesData };
}

/**
 * Страницы аккаунта получают собственное ТЕЛО — секции «Личный кабинет» и
 * «Заказы» (тестировщик 14.09, дословно: «Для страницы заказы <…> создать
 * исключительно там секцию Заказы <…> Для страницы личный кабинет <…> секцию
 * Личный кабинет»).
 *
 * Почему это ОТДЕЛЬНЫЙ шаг, а не правка `seedProfilePage`. Тот идемпотентен по
 * СТРАНИЦЕ: у живых сайтов `page-profile` уже создан (и создан пустым — ровно
 * [Header, Footer], тела у страницы тогда не было), поэтому он выходит по
 * первой же проверке и секцию туда никогда не положит. Досев тела — здесь.
 *
 * Что делает, по шагам:
 *   1. заводит страницу `page-orders` (`/account/orders`), если её нет: до
 *      14.09 записи страницы не существовало ни у одной темы — пункт меню
 *      «Профиль → Заказы» открывал витрину в режиме просмотра;
 *   2. кладёт `AccountSection` в `page-profile`, если её там нет;
 *   3. кладёт `OrdersSection` в `page-orders`, если её там нет.
 *
 * Идемпотентность — по НАЛИЧИЮ БЛОКА, а не по факту прогона. Скрыть секцию
 * мерчант может (`props.hidden`), и блок при этом остаётся в контенте — сидер
 * его видит и проходит мимо, не дублируя и не «открывая» обратно. Удалить
 * секцию через конструктор нельзя (она в NON_DELETABLE), поэтому её отсутствие
 * означает ровно одно: досева ещё не было.
 *
 * Вставка — ПЕРЕД подвалом (и после шапки), чтобы порядок совпадал с сидом
 * темы `packages/theme-<t>/pages/{profile,orders}.json`.
 */
export function seedAccountPageSections(
  out: Record<string, unknown>,
): Record<string, unknown> {
  // Пустая ревизия (без pagesData вовсе) — не сайт, а заглушка: у новых сайтов
  // страницы приходят из манифеста темы. Не создаём pagesData на ровном месте,
  // иначе `migrateRevisionData({})` перестаёт быть тождественным преобразованием.
  if (!out.pagesData || typeof out.pagesData !== 'object') return out;

  let pagesData = out.pagesData as Record<string, unknown>;
  let pages = Array.isArray(out.pages)
    ? (out.pages as Array<Record<string, unknown>>)
    : [];
  let changed = false;
  // b45-fix: детерминированные id (не Date.now()) — см. коммент у
  // getHomeChrome. Совпадает с сидом theme.json.

  // ── 1. Страница «Заказы» ────────────────────────────────────────────────
  const ordersHasMeta = pages.some(
    (p) =>
      p?.id === 'page-orders' ||
      String(p?.slug ?? '').replace(/^\/+|\/+$/g, '') === 'account/orders',
  );
  if (!ordersHasMeta) {
    pages = [
      ...pages,
      {
        id: 'page-orders',
        name: 'Заказы',
        slug: '/account/orders',
        role: 'system',
        contentFile: 'pages/orders.json',
      },
    ];
    changed = true;
  }
  if (!pagesData['page-orders']) {
    const chrome = getHomeChrome(pagesData);
    pagesData = {
      ...pagesData,
      'page-orders': {
        // Свои id — Puck ломается на дубликатах между страницами.
        content: [
          {
            ...chrome.headerBlock,
            props: { ...(chrome.headerBlock.props ?? {}), id: 'Header-orders' },
          },
          {
            ...chrome.footerBlock,
            props: { ...(chrome.footerBlock.props ?? {}), id: 'Footer-orders' },
          },
        ],
        root: { props: { meta: { title: 'Мои заказы' } } },
        zones: {},
      } as PageData,
    };
    changed = true;
  }

  // ── 2-3. Тело страниц: секция перед подвалом ────────────────────────────
  const BODIES: Array<{ pageId: string; block: string }> = [
    { pageId: 'page-profile', block: 'AccountSection' },
    { pageId: 'page-orders', block: 'OrdersSection' },
  ];
  for (const { pageId, block } of BODIES) {
    const pd = pagesData[pageId] as PageData | undefined;
    if (!pd || !Array.isArray(pd.content)) continue;
    const content = pd.content as Block[];
    if (content.some((b) => b?.type === block)) continue;
    const section: Block = {
      type: block,
      props: { id: `${block}-1`, colorScheme: 2 },
    };
    const footerIdx = content.findIndex((b) => b?.type === 'Footer');
    const next =
      footerIdx === -1
        ? [...content, section]
        : [...content.slice(0, footerIdx), section, ...content.slice(footerIdx)];
    pagesData = { ...pagesData, [pageId]: { ...(pd as object), content: next } };
    changed = true;
  }

  if (!changed) return out;
  return { ...out, pages, pagesData };
}

/**
 * Страница «Вход» (`/login`) и её тело — секция «Вход» (владелец 14.09,
 * дословно: «В меню у пункта Профиль создать новый подпункт Вход. На странице
 * Вход как раз отобажать от темы решистрацию/вход»).
 *
 * До 14.09 записи страницы не было НИ У ОДНОЙ темы: `/login` собиралась Astro
 * как статика и в конструкторе не показывалась вовсе. Поэтому сидер делает два
 * шага:
 *   1. заводит страницу `page-login` (`/login`), если её нет;
 *   2. кладёт `LoginSection` в `page-login`, если её там нет.
 *
 * Идемпотентность — по НАЛИЧИЮ БЛОКА, а не по факту прогона (как у
 * `seedAccountPageSections`). Скрыть секцию мерчант может (`props.hidden`), и
 * блок при этом остаётся в контенте — сидер его видит и проходит мимо, не
 * дублируя и не «открывая» обратно. Удалить секцию через конструктор нельзя
 * (она в NON_DELETABLE), поэтому её отсутствие означает ровно одно: досева
 * ещё не было.
 *
 * Вставка — ПЕРЕД подвалом (и после шапки), чтобы порядок совпадал с сидом
 * темы `packages/theme-<t>/pages/login.json`.
 *
 * Дефолты секции здесь НЕ проставляются сверх `colorScheme`/`padding`:
 * «Заголовок» и «Текст» приходят из `defaults` puckConfig и из фолбэков порта.
 * Записать их в ревизию значило бы заморозить нынешние формулировки у всех
 * живых сайтов — ровно та ловушка, что описана в
 * «сид страницы замораживает настройки темы».
 */
export function seedLoginPageSection(
  out: Record<string, unknown>,
): Record<string, unknown> {
  // Пустая ревизия (без pagesData вовсе) — не сайт, а заглушка: у новых сайтов
  // страницы приходят из манифеста темы. Не создаём pagesData на ровном месте,
  // иначе `migrateRevisionData({})` перестаёт быть тождественным преобразованием.
  if (!out.pagesData || typeof out.pagesData !== 'object') return out;

  let pagesData = out.pagesData as Record<string, unknown>;
  let pages = Array.isArray(out.pages)
    ? (out.pages as Array<Record<string, unknown>>)
    : [];
  let changed = false;
  // b45-fix: детерминированные id (не Date.now()) — см. коммент у
  // getHomeChrome. Совпадает с сидом theme.json.

  // ── 1. Страница «Вход» ──────────────────────────────────────────────────
  const hasMeta = pages.some(
    (p) =>
      p?.id === 'page-login' ||
      String(p?.slug ?? '').replace(/^\/+|\/+$/g, '') === 'login',
  );
  if (!hasMeta) {
    pages = [
      ...pages,
      {
        id: 'page-login',
        name: 'Вход',
        slug: '/login',
        role: 'system',
        contentFile: 'pages/login.json',
      },
    ];
    changed = true;
  }
  if (!pagesData['page-login']) {
    const chrome = getHomeChrome(pagesData);
    pagesData = {
      ...pagesData,
      'page-login': {
        // Свои id — Puck ломается на дубликатах между страницами.
        content: [
          {
            ...chrome.headerBlock,
            props: { ...(chrome.headerBlock.props ?? {}), id: 'Header-login' },
          },
          {
            ...chrome.footerBlock,
            props: { ...(chrome.footerBlock.props ?? {}), id: 'Footer-login' },
          },
        ],
        root: { props: { meta: { title: 'Вход' } } },
        zones: {},
      } as PageData,
    };
    changed = true;
  }

  // ── 2. Тело страницы: секция перед подвалом ─────────────────────────────
  const pd = pagesData['page-login'] as PageData | undefined;
  if (pd && Array.isArray(pd.content)) {
    const content = pd.content as Block[];
    if (!content.some((b) => b?.type === 'LoginSection')) {
      const section: Block = {
        type: 'LoginSection',
        props: {
          id: 'LoginSection-1',
          colorScheme: 2,
          padding: { top: 80, bottom: 80 },
        },
      };
      const footerIdx = content.findIndex((b) => b?.type === 'Footer');
      const next =
        footerIdx === -1
          ? [...content, section]
          : [...content.slice(0, footerIdx), section, ...content.slice(footerIdx)];
      pagesData = { ...pagesData, 'page-login': { ...(pd as object), content: next } };
      changed = true;
    }
  }

  if (!changed) return out;
  return { ...out, pages, pagesData };
}
