/**
 * Секция «Вход» — тело страницы `/login` (пункт меню «Профиль → Вход»).
 *
 * Откуда проверка. Владелец 14.09, дословно: «В меню у пункта Профиль создать
 * новый подпункт Вход. На странице Вход как раз отобажать от темы
 * решистрацию/вход. У секции Вход два парметра Заголовок и Текст. У секции в
 * сайдбаре Цветовая схема и отступы».
 *
 * БЫЛО РОВНО ЧЕТЫРЕ параметра: heading, text, colorScheme, padding. 15.09
 * владелец расширил состав пунктом [5] репорта тестера: «В секции Вход
 * добавить параметр кнопка. Можно взять из секции Изображение с текстом».
 * Пятый параметр — `button`, формат {text, link} дословно как у ImageWithText
 * (суб-панель, hiddenInMainPanel). Состав панели по-прежнему канон
 * (`conformance/panel-canon.json` + `pnpm test:panel-canon`), просто теперь
 * пять полей, а не четыре — пересъёмка канона отдельным коммитом.
 * Обратите внимание на разницу с соседями: у «Избранного» два параметра, у
 * «Личного кабинета» и «Заказов» — один. Это не описка и не повод
 * «унифицировать»: каждый состав назван владельцем отдельно.
 *
 * Три требования ломаются тремя разными способами, и каждое проверяется:
 *   • состав панели — правится в одном puckConfig, а видит владелец через день;
 *   • «от темы регистрацию/вход» — тело обязано нести ЖИВУЮ форму входа темы
 *     (magic-link), а не заглушку theme-base «Загрузка…»;
 *   • «Заголовок» и «Текст» обязаны ДОЕЗЖАТЬ до разметки — поле, которое стоит
 *     в панели, но не меняет рендер, и есть «мёртвая настройка».
 *
 * Что здесь НЕ проверяется (сказано честно):
 *   • пункт меню «Вход» и лок кнопки «Добавить секцию» живут в
 *     backend/services/constructor — их сторожит `login-section-page-scope`
 *     там же;
 *   • что состав панели не поедет ЗАВТРА — предмет `test:panel-canon`.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections <тема>.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  PAGE_REGISTRY,
  LOGIN_SECTION_THEMES,
  getSystemPageRoute,
  getChromeKind,
  isVerbatimRoute,
} from "../page-registry";
import { migrateRevisionData } from "../../utils/revision-migrations";
import { extractPageBlocks } from "../page-blocks";
import { composeV2Page } from "../v2-page-composer";

const CANON_DUMP = resolve(__dirname, "panel-canon.mjs");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

const BLOCK = "LoginSection";
const PAGE_ID = "page-login";
const ROUTE = "login";
const SLUG = "/login";
const SEED_FILE = "pages/login.json";

/**
 * Ровно пять параметров в этом порядке. Порядок — тот, в котором владелец их
 * назвал: сперва содержимое («Заголовок», «Текст»), потом оформление
 * («Цветовая схема», «Отступы»), пятым — «Кнопка» (репорт тестера [5], 15.09).
 */
const EXPECTED_FIELDS = ["heading", "text", "colorScheme", "padding", "button"] as const;
const EXPECTED_LABELS: Record<string, string> = {
  heading: "Заголовок",
  text: "Текст",
  colorScheme: "Цветовая схема",
  padding: "Отступы",
  button: "Кнопка",
};

type FieldCanon = {
  type: string | null;
  label: string;
  visibility: string;
  objectFields?: Record<string, FieldCanon>;
};
type BlockCanon = {
  label: string;
  fields: Record<string, FieldCanon>;
};

const distReady = existsSync(
  resolve(
    SITES_ROOT,
    "dist",
    "src",
    "controllers",
    "theme-puck-config.controller.js",
  ),
);

const panels: Record<string, Record<string, BlockCanon>> = {};

beforeAll(() => {
  if (!distReady) return;
  // Один дочерний процесс на пять тем — контроллер тянет ESM-модули блоков,
  // в jest (CJS) их не импортировать. Тот же приём, что у panel-canon.spec.
  const raw = execFileSync("node", [CANON_DUMP], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  Object.assign(panels, JSON.parse(raw).themes);
}, 300_000);

/** Рендер секции портом темы. Возвращает HTML или '' если сборки нет. */
function renderSection(
  theme: string,
  props: Record<string, unknown>,
): string | null {
  const mf = resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json");
  if (!existsSync(mf)) return null; // отсутствие сборки ловит проверка distReady
  const rows = JSON.parse(
    execFileSync(
      "node",
      [RENDERER, theme, JSON.stringify([{ block: BLOCK, props }])],
      { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
    ),
  ) as Array<{ html?: string; error?: string; missing?: boolean }>;
  const row = rows[0];
  expect(row?.error).toBeUndefined();
  expect(row?.missing).toBeFalsy();
  return row?.html ?? "";
}

describe("секция «Вход» — панель", () => {
  it("dist собран (pnpm build && pnpm build:blocks)", () => {
    expect(distReady).toBe(true);
  });

  it.each(THEMES)("%s: секция есть в конфиге конструктора", (theme) => {
    if (!distReady) return;
    expect(Object.keys(panels[theme] ?? {})).toContain(BLOCK);
  });

  it.each(THEMES)("%s: подписана «Вход»", (theme) => {
    if (!distReady) return;
    expect(panels[theme]?.[BLOCK]?.label).toBe("Вход");
  });

  it.each(THEMES)("%s: РОВНО пять параметров, в назначенном порядке", (theme) => {
    if (!distReady) return;
    const fields = Object.keys(panels[theme]?.[BLOCK]?.fields ?? {});
    // Сообщение важнее равенства: лишний параметр надо назвать по имени.
    const extra = fields.filter((f) => !EXPECTED_FIELDS.includes(f as never));
    const missing = EXPECTED_FIELDS.filter((f) => !fields.includes(f));
    expect({ theme, extra, missing }).toEqual({ theme, extra: [], missing: [] });
    expect(fields).toEqual([...EXPECTED_FIELDS]);
  });

  it.each(THEMES)("%s: подписи полей — ровно те, что назвал владелец", (theme) => {
    if (!distReady) return;
    const fields = panels[theme]?.[BLOCK]?.fields ?? {};
    for (const [name, label] of Object.entries(EXPECTED_LABELS)) {
      expect({ name, label: fields[name]?.label }).toEqual({ name, label });
    }
  });

  it.each(THEMES)(
    "%s: «Цветовая схема» и «Отступы» — тот же контрол, что у соседей",
    (theme) => {
      if (!distReady) return;
      const mine = panels[theme]?.[BLOCK]?.fields ?? {};
      // Формулировки и типы не выдумываем: берём ровно те же поля у секции,
      // которая их уже показывает и уже принята владельцем («Избранное»).
      // Разошлись — тест назовёт.
      const reference = panels[theme]?.WishlistSection?.fields ?? {};
      expect(mine.colorScheme).toEqual(reference.colorScheme);
      expect(mine.padding).toEqual(reference.padding);
    },
  );

  it.each(THEMES)("%s: «Заголовок» и «Текст» — вводимые поля", (theme) => {
    if (!distReady) return;
    const fields = panels[theme]?.[BLOCK]?.fields ?? {};
    // Однострочный заголовок и многострочный текст. Не `custom`/`object`:
    // владелец просил два простых параметра, а не подпанель.
    expect(fields.heading?.type).toBe("text");
    expect(fields.text?.type).toBe("textarea");
    // Оба видны в панели, а не спрятаны за «глазом».
    expect(fields.heading?.visibility).toBe("panel");
    expect(fields.text?.visibility).toBe("panel");
  });

  it.each(THEMES)(
    "%s: «Кнопка» — суб-панель как у ImageWithText, но БЕЗ ссылки",
    (theme) => {
      if (!distReady) return;
      const mine = panels[theme]?.[BLOCK]?.fields?.button;
      const reference = panels[theme]?.ImageWithText?.fields?.button;
      expect(mine?.label).toBe("Кнопка");
      expect(mine?.type).toBe(reference?.type);
      expect(mine?.visibility).toBe(reference?.visibility);
      // Источник формы владелец назвал буквально («из секции можно взять
      // Изображение с текстом»), но ссылку той же просьбой убрал 2026-09-16:
      // на странице входа кнопка ведёт по своей логике, выбирать чужой адрес
      // мерчанту здесь незачем. Поэтому от образца остаётся ровно «Текст»,
      // и контрол у него тот же, что у образца.
      expect(Object.keys(mine?.objectFields ?? {})).toEqual(["text"]);
      expect(mine?.objectFields?.text?.type).toBe(reference?.objectFields?.text?.type);
      expect(mine?.objectFields?.link).toBeUndefined();
    },
  );
});

describe("секция «Вход» — рендер", () => {
  it.each(THEMES)("%s: собственный порт темы есть в манифесте секций", (theme) => {
    const mf = resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json");
    if (!existsSync(mf)) return;
    const manifest = JSON.parse(readFileSync(mf, "utf-8")) as Record<string, string>;
    expect(Object.keys(manifest)).toContain(BLOCK);
  });

  it.each(THEMES)("%s: рендерит непустую разметку своим портом", (theme) => {
    const html = renderSection(theme, { id: `${BLOCK}-1`, colorScheme: "3" });
    if (html === null) return;
    // Живая секция, а не заглушка: корень адресуем конструктору (клик по
    // превью открывает панель), схема приезжает классом.
    expect(html).toContain(`data-puck-component-id="${BLOCK}-1"`);
    expect(html).toContain("color-scheme-3");
    expect(html).toContain("data-login-page");
  });

  it.each(THEMES)("%s: несёт ЖИВУЮ форму входа темы (magic-link)", (theme) => {
    const html = renderSection(theme, { id: `${BLOCK}-1` });
    if (html === null) return;
    // «На странице Вход как раз отобажать от темы решистрацию/вход» — значит
    // та же форма, что рисовал `themes/<t>/src/pages/login.astro`: поле почты,
    // кнопка запроса ссылки, место под ошибку. Заглушка theme-base их не имеет.
    expect(html).toContain("magic-form");
    expect(html).toContain("login-email");
    expect(html).toContain("btn-magic");
    expect(html).toContain("login-error");
  });

  it.each(THEMES)("%s: «Заголовок» доезжает до разметки", (theme) => {
    const html = renderSection(theme, {
      id: `${BLOCK}-1`,
      heading: "ЗАГОЛОВОК-ПРУФ-42",
    });
    if (html === null) return;
    // Мёртвая настройка = поле в панели, которое ничего не меняет. Ровно этим
    // болели секции до аудита, поэтому проверяем СЛЕДСТВИЕ, а не наличие поля.
    expect(html).toContain("ЗАГОЛОВОК-ПРУФ-42");
  });

  it.each(THEMES)("%s: «Текст» доезжает до разметки", (theme) => {
    const html = renderSection(theme, {
      id: `${BLOCK}-1`,
      text: "ТЕКСТ-ПРУФ-42",
    });
    if (html === null) return;
    expect(html).toContain("ТЕКСТ-ПРУФ-42");
  });

  it.each(THEMES)("%s: «Отступы» доезжают до разметки", (theme) => {
    const html = renderSection(theme, {
      id: `${BLOCK}-1`,
      padding: { top: 137, bottom: 42 },
    });
    if (html === null) return;
    expect(html).toMatch(/padding-top:\s*137px/);
    expect(html).toMatch(/padding-bottom:\s*42px/);
  });

  it.each(THEMES)("%s: без пропов рисует дефолтные заголовок и текст", (theme) => {
    const html = renderSection(theme, { id: `${BLOCK}-1` });
    if (html === null) return;
    // Дефолт = то, что стояло на живой витрине ДО этой правки (замер 14.09:
    // h1 «Вход в аккаунт» + подпись про ссылку). Внешний вид не должен
    // измениться у тех, кто ничего не настраивал.
    expect(html).toContain("Вход в аккаунт");
    expect(html).toContain("Введите e-mail");
  });

  it.each(THEMES)("%s: без пропа «Кнопка» ничего лишнего не рисует (нет регрессии)", (theme) => {
    const html = renderSection(theme, { id: `${BLOCK}-1` });
    if (html === null) return;
    // Пятый параметр добавлен ПОСЛЕ живых сайтов — сайт без настройки обязан
    // выглядеть как прежде: без пропа кнопки нет вовсе.
    expect(html).not.toContain('data-puck-subsection-field="button"');
  });

  it.each(THEMES)("%s: «Кнопка» доезжает текстом и ссылкой до разметки", (theme) => {
    const html = renderSection(theme, {
      id: `${BLOCK}-1`,
      button: { text: "КНОПКА-ПРУФ-42", link: "/proof-link-42" },
    });
    if (html === null) return;
    expect(html).toContain("КНОПКА-ПРУФ-42");
    expect(html).toContain("/proof-link-42");
    expect(html).toContain('data-puck-subsection-field="button"');
  });

  it.each(THEMES)("%s: «Кнопка» с пустым текстом СКРЫТА", (theme) => {
    const html = renderSection(theme, {
      id: `${BLOCK}-1`,
      button: { text: "", link: "/proof-link-42" },
    });
    if (html === null) return;
    expect(html).not.toContain("/proof-link-42");
    expect(html).not.toContain('data-puck-subsection-field="button"');
  });
});

describe("страница «Вход» — заведена в реестре", () => {
  it(`${PAGE_ID}: запись реестра на маршруте ${ROUTE}`, () => {
    const entry = PAGE_REGISTRY.find((e) => e.id === PAGE_ID);
    expect(entry).toBeDefined();
    expect(entry?.route).toBe(ROUTE);
    expect(entry?.chrome).toBe("full");
  });

  it("«login» — verbatim-первосегмент (как account/product/cart)", () => {
    // Запись страницы — kind:'verbatim' (как page-orders): пересадка идёт
    // адресным гейтом LOGIN_SECTION_THEMES, а не через getContentPages.
    // Побочный и желанный эффект: кастомная страница мерчанта со слагом
    // `login` больше не может перезаписать страницу входа
    // (collision-guard в v2-live-pages).
    expect(isVerbatimRoute("login")).toBe(true);
  });

  it("хаб /account и /account/order verbatim, как были", () => {
    // Ремень соседей: заводя свою страницу, нельзя сдвинуть чужие маршруты.
    expect(isVerbatimRoute("account")).toBe(true);
    expect(isVerbatimRoute("account/order")).toBe(true);
    expect(isVerbatimRoute("account/orders")).toBe(true);
    expect(isVerbatimRoute("account/profile")).toBe(true);
  });

  it("все пять тем в LOGIN_SECTION_THEMES", () => {
    for (const t of THEMES) expect(LOGIN_SECTION_THEMES.has(t)).toBe(true);
  });

  it(`${PAGE_ID}: превью резолвит страницу по id`, () => {
    expect(getSystemPageRoute(PAGE_ID)).toBe(ROUTE);
    expect(getChromeKind(ROUTE)).toBe("full");
  });

  it.each(THEMES)(
    "%s: манифест объявляет страницу с существующим сидом",
    (theme) => {
      const pkg = resolve(SITES_ROOT, "packages", `theme-${theme}`);
      const manifest = JSON.parse(
        readFileSync(resolve(pkg, "theme.json"), "utf-8"),
      ) as {
        pages?: Array<{
          id: string;
          name: string;
          slug: string;
          contentFile: string;
        }>;
      };
      const page = (manifest.pages ?? []).find((p) => p.id === PAGE_ID);
      expect(page).toBeDefined();
      expect(page?.name).toBe("Вход");
      expect(page?.slug).toBe(SLUG);
      expect(page?.contentFile).toBe(SEED_FILE);
      expect(existsSync(resolve(pkg, SEED_FILE))).toBe(true);
    },
  );

  it.each(THEMES)("%s: у темы есть свой шелл страницы входа", (theme) => {
    // Секцию пересаживают ТОЛЬКО поверх собственного шелла темы
    // (requireOwnShell). Нет шелла — нет и пересадки, страница осталась бы
    // статикой, а «Заголовок»/«Текст» были бы мёртвыми на live.
    expect(
      existsSync(resolve(SITES_ROOT, "themes", theme, "src", "pages", "login.astro")),
    ).toBe(true);
  });
});

describe("секция «Вход» — только на своей странице", () => {
  it.each(THEMES)("%s: сид своей страницы несёт ровно одну секцию", (theme) => {
    const seed = JSON.parse(
      readFileSync(resolve(SITES_ROOT, "packages", `theme-${theme}`, SEED_FILE), "utf-8"),
    ) as { content?: Array<{ type?: string }> };
    const mine = (seed.content ?? []).filter((b) => b?.type === BLOCK);
    expect(mine).toHaveLength(1);
  });

  it.each(THEMES)("%s: ни один другой сид страниц её не содержит", (theme) => {
    const dir = resolve(SITES_ROOT, "packages", `theme-${theme}`, "pages");
    const guilty: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      if (`pages/${file}` === SEED_FILE) continue;
      const seed = JSON.parse(readFileSync(resolve(dir, file), "utf-8")) as {
        content?: Array<{ type?: string }>;
      };
      if ((seed.content ?? []).some((b) => b?.type === BLOCK)) guilty.push(file);
    }
    expect({ theme, guilty }).toEqual({ theme, guilty: [] });
  });

  /** Ревизия «как у живого сайта»: главная + профиль, страницы входа нет. */
  const liveLike = () => ({
    pages: [
      { id: "home", name: "Главная", slug: "/", role: "system" },
      {
        id: "page-profile",
        name: "Профиль",
        slug: "/account/profile",
        role: "system",
      },
    ],
    pagesData: {
      home: {
        content: [
          { type: "Header", props: { id: "Header-1" } },
          { type: "Hero", props: { id: "Hero-1" } },
          { type: "Footer", props: { id: "Footer-1" } },
        ],
        root: { props: {} },
        zones: {},
      },
      "page-profile": {
        content: [
          { type: "Header", props: { id: "Header-profile" } },
          { type: "Footer", props: { id: "Footer-profile" } },
        ],
        root: { props: {} },
        zones: {},
      },
    },
  });

  it("сидер заводит страницу и кладёт в неё секцию", () => {
    const after = migrateRevisionData(liveLike(), "rose") as {
      pages: Array<{ id: string; name?: string; slug?: string }>;
      pagesData: Record<string, { content: Array<{ type?: string }> }>;
    };

    expect(after.pages.map((p) => p.id)).toContain(PAGE_ID);
    expect(after.pages.find((p) => p.id === PAGE_ID)?.slug).toBe(SLUG);

    const own = after.pagesData[PAGE_ID]?.content ?? [];
    // Шапка → секция → подвал: тот же порядок, что в сиде темы.
    expect(own.map((b) => b?.type)).toEqual(["Header", BLOCK, "Footer"]);
  });

  it("секция не попадает на чужие страницы", () => {
    const after = migrateRevisionData(liveLike(), "rose") as {
      pagesData: Record<string, { content: Array<{ type?: string }> }>;
    };
    const elsewhere = Object.entries(after.pagesData)
      .filter(([id]) => id !== PAGE_ID)
      .filter(([, pd]) => (pd?.content ?? []).some((b) => b?.type === BLOCK))
      .map(([id]) => id);
    expect(elsewhere).toEqual([]);
  });

  it("повторный прогон сидера ничего не удваивает", () => {
    const once = migrateRevisionData(liveLike(), "rose");
    const twice = migrateRevisionData(once, "rose") as {
      pages: Array<{ id: string }>;
      pagesData: Record<string, { content: Array<{ type?: string }> }>;
    };
    expect(twice.pages.filter((p) => p.id === PAGE_ID)).toHaveLength(1);
    expect(
      (twice.pagesData[PAGE_ID]?.content ?? []).filter((b) => b?.type === BLOCK),
    ).toHaveLength(1);
  });

  it("правки мерчанта переживают повторный прогон", () => {
    const edited = migrateRevisionData(
      {
        pages: [
          { id: "home", name: "Главная", slug: "/", role: "system" },
          { id: PAGE_ID, name: "Вход", slug: SLUG, role: "system" },
        ],
        pagesData: {
          home: { content: [], root: { props: {} }, zones: {} },
          [PAGE_ID]: {
            content: [
              { type: "Header", props: { id: "H-l" } },
              {
                type: BLOCK,
                props: {
                  id: "L-1",
                  colorScheme: 5,
                  heading: "Свой заголовок",
                  text: "Свой текст",
                  padding: { top: 16, bottom: 24 },
                },
              },
              { type: "Footer", props: { id: "F-l" } },
            ],
            root: { props: {} },
            zones: {},
          },
        },
      },
      "rose",
    ) as {
      pagesData: Record<
        string,
        { content: Array<{ type?: string; props?: Record<string, unknown> }> }
      >;
    };
    const section = edited.pagesData[PAGE_ID]?.content.find(
      (b) => b?.type === BLOCK,
    )?.props;
    expect(section?.colorScheme).toBe(5);
    expect(section?.heading).toBe("Свой заголовок");
    expect(section?.text).toBe("Свой текст");
    expect(section?.padding).toEqual({ top: 16, bottom: 24 });
  });

  it("скрытую секцию сидер не дублирует и не открывает обратно", () => {
    // Удалить секцию мерчант не может (NON_DELETABLE в конструкторе), а вот
    // скрыть «глазом» — да. Скрытие живёт в props.hidden, блок остаётся в
    // контенте: сидер обязан увидеть его и пройти мимо.
    const after = migrateRevisionData(
      {
        pages: [
          { id: "home", name: "Главная", slug: "/", role: "system" },
          { id: PAGE_ID, name: "Вход", slug: SLUG, role: "system" },
        ],
        pagesData: {
          home: { content: [], root: { props: {} }, zones: {} },
          [PAGE_ID]: {
            content: [
              { type: "Header", props: { id: "H-l" } },
              { type: BLOCK, props: { id: "L-1", hidden: true } },
              { type: "Footer", props: { id: "F-l" } },
            ],
            root: { props: {} },
            zones: {},
          },
        },
      },
      "rose",
    ) as {
      pagesData: Record<
        string,
        { content: Array<{ type?: string; props?: Record<string, unknown> }> }
      >;
    };
    const mine = (after.pagesData[PAGE_ID]?.content ?? []).filter(
      (b) => b?.type === BLOCK,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]?.props?.hidden).toBe(true);
  });

  it("страница входа появляется РОВНО там же, где «Заказы»", () => {
    // Сидер не должен заводить свой, особый класс поведения. Проверяем СВЯЗЬ:
    // на любой ревизии page-login и page-orders появляются вместе — оба
    // приходят из одной семьи «Профиль» и оба стоят после seedProfilePage.
    //
    // Почему не «пустая ревизия остаётся пустой»: это неправда и ДО этой
    // правки — migrateRevisionData({}) уже возвращал page-checkout-result,
    // page-profile, page-wishlist и page-orders (проверено на dist базы).
    // Собственный guard `if (!out.pagesData) return out` у сидера есть, но к
    // моменту его вызова pagesData уже создан соседями — как и у
    // seedAccountPageSections.
    for (const input of [{}, liveLike()]) {
      const after = migrateRevisionData(input, "rose") as {
        pagesData?: Record<string, unknown>;
      };
      const data = after.pagesData ?? {};
      expect({
        login: "page-login" in data,
        orders: "page-orders" in data,
      }).toEqual({ login: true, orders: true });
    }
  });
});

/**
 * ПУТЬ ВИТРИНЫ, а не путь порта.
 *
 * Замечание владельца 14.09: «твой гард проверял отступы на рендере порта и был
 * зелёным — значит гард смотрит не на тот путь, которым страница попадает на
 * витрину». Замечание по существу: рендер порта — это только последнее звено.
 * Настройка может умереть РАНЬШЕ — в `extractPageBlocks`, где пропы блока
 * нормализуются перед рендером, и тогда до порта доедет уже пустота, а гард на
 * порту останется зелёным.
 *
 * Здесь проверяется вся цепочка, которой страница доезжает до витрины:
 *   ревизия → extractPageBlocks (нормализация пропов)
 *           → рендер порта темы
 *           → composeV2Page (пересадка в шелл)
 * — те же функции, что зовёт `composeContentPagesIntoDist` на сборке.
 *
 * Значения взяты НЕ дефолтные. Это принципиально: дефолт отступов 80/80 совпал
 * бы с фолбэком порта (`padding?.top ?? 80`), и «настройка работает» нельзя
 * было бы отличить от «настройка потеряна, сработал фолбэк». 137/42 не
 * получится ниоткуда, кроме как из ревизии.
 */
describe("секция «Вход» — настройки доезжают до ВИТРИНЫ (путь сборки)", () => {
  const PROPS = {
    id: "LoginSection-live",
    heading: "ЗАГОЛОВОК-ВИТРИНЫ",
    text: "ТЕКСТ-ВИТРИНЫ",
    colorScheme: 4,
    padding: { top: 137, bottom: 42 },
  };

  const revision = () => ({
    pages: [
      { id: "home", name: "Главная", slug: "/", role: "system" },
      { id: PAGE_ID, name: "Вход", slug: SLUG, role: "system" },
    ],
    pagesData: {
      home: { content: [], root: { props: {} }, zones: {} },
      [PAGE_ID]: {
        content: [
          { type: "Header", props: { id: "Header-login" } },
          { type: BLOCK, props: { ...PROPS } },
          { type: "Footer", props: { id: "Footer-login" } },
        ],
        root: { props: {} },
        zones: {},
      },
    },
  });

  /** Шелл темы: composeV2Page опирается на <body> и последний </footer>. */
  const SHELL =
    `<!doctype html><html><head><title>шелл</title></head><body>` +
    `<main>тело шелла</main><footer>подвал шелла</footer></body></html>`;

  it("extractPageBlocks НЕ теряет настройки секции", async () => {
    const blocks = await extractPageBlocks(
      revision() as never,
      PAGE_ID,
      null,
      "rose",
      "site-1",
    );
    const mine = (blocks ?? []).find((b) => b.type === BLOCK);
    expect(mine).toBeDefined();
    // Именно здесь настройка и могла бы умереть молча.
    expect(mine!.props.padding).toEqual({ top: 137, bottom: 42 });
    expect(mine!.props.heading).toBe("ЗАГОЛОВОК-ВИТРИНЫ");
    expect(mine!.props.text).toBe("ТЕКСТ-ВИТРИНЫ");
    expect(mine!.props.colorScheme).toBe(4);
  });

  it.each(THEMES)(
    "%s: настройки доезжают до HTML собранной страницы",
    async (theme) => {
      const mf = resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json");
      if (!existsSync(mf)) return;

      // 1. Ревизия → пропы (та же нормализация, что на сборке витрины).
      const blocks = await extractPageBlocks(
        revision() as never,
        PAGE_ID,
        null,
        theme,
        "site-1",
      );
      const section = (blocks ?? []).find((b) => b.type === BLOCK);
      expect(section).toBeDefined();

      // 2. Пропы → HTML портом темы (рендерим ИМЕННО извлечённые пропы,
      //    а не исходные: иначе потеря на шаге 1 осталась бы незамеченной).
      const rows = JSON.parse(
        execFileSync(
          "node",
          [RENDERER, theme, JSON.stringify([{ block: BLOCK, props: section!.props }])],
          { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
        ),
      ) as Array<{ html?: string; error?: string }>;
      expect(rows[0]?.error).toBeUndefined();
      const blockHtml = rows[0]?.html ?? "";

      // 3. HTML → страница (пересадка в шелл темы).
      const page = composeV2Page({
        shellHtml: SHELL,
        blocksHtml: [blockHtml],
        blockTypes: [BLOCK],
        blockSchemes: [String(section!.props.colorScheme ?? "")],
        assetPrefix: null,
      });
      expect(page).not.toBeNull();

      // Отступы — ровно те, что задал мерчант, а не фолбэк 80/80.
      expect(page!).toMatch(/padding-top:\s*137px/);
      expect(page!).toMatch(/padding-bottom:\s*42px/);
      expect(page!).not.toMatch(/padding-top:\s*80px/);
      // Заголовок, текст и схема — тоже на месте.
      expect(page!).toContain("ЗАГОЛОВОК-ВИТРИНЫ");
      expect(page!).toContain("ТЕКСТ-ВИТРИНЫ");
      expect(page!).toContain("color-scheme-4");
      // Тело страницы вытеснило тело шелла (пересадка состоялась).
      expect(page!).not.toContain("тело шелла");
    },
  );

  it.each(THEMES)(
    "%s: БЕЗ отступов в ревизии страница получает дефолт 80/80",
    async (theme) => {
      const mf = resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json");
      if (!existsSync(mf)) return;
      const rev = revision() as unknown as {
        pagesData: Record<string, { content: Array<{ type: string; props: Record<string, unknown> }> }>;
      };
      const sec = rev.pagesData[PAGE_ID]!.content.find((b) => b.type === BLOCK)!;
      delete sec.props.padding;
      const blocks = await extractPageBlocks(rev as never, PAGE_ID, null, theme, "site-1");
      const props = (blocks ?? []).find((b) => b.type === BLOCK)!.props;
      const rows = JSON.parse(
        execFileSync(
          "node",
          [RENDERER, theme, JSON.stringify([{ block: BLOCK, props }])],
          { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
        ),
      ) as Array<{ html?: string }>;
      // Фолбэк порта — он и рисуется на живых сайтах, где мерчант ничего не
      // трогал. Проверка нужна, чтобы «137/42 доехали» не оказалось правдой
      // только потому, что порт печатает отступы всегда одинаково.
      expect(rows[0]?.html ?? "").toMatch(/padding-top:\s*80px/);
    },
  );
});
