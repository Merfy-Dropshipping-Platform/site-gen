/**
 * Секции «Личный кабинет» и «Заказы» — каждая живёт ТОЛЬКО на своей странице,
 * и в её панели РОВНО ОДИН параметр.
 *
 * Откуда проверка. Тестировщик 14.09, дословно: «Для страницы заказы в блоке
 * Тема залочить кнопку добавление секций, создать исключительно там секцию
 * Заказы, в сайдбаре только цветовая схема. Для страницы личный кабинет <…>
 * создать исключительно там секцию Личный кабинет, в сайдбаре только цветовая
 * схема».
 *
 * Обратите внимание: у «Избранного» параметров ДВА (схема + отступы), здесь
 * просят ОДИН. Это не описка — отступы у страниц аккаунта заданы вёрсткой
 * (.account-page-container), мерчанту их не отдают. Поэтому гард сравнивает
 * состав не с «Избранным», а с числом 1 и называет лишнее поле по имени.
 *
 * Три требования ломаются тремя разными способами, и каждое проверяется:
 *   • состав панели — правится в одном puckConfig, а видит тестер через день;
 *   • «исключительно там» — держится на сидах страниц + сидерах ревизий
 *     (палитра конструктора — другой репозиторий, там свой гард);
 *   • страницы должны быть заведены в реестре, иначе пункта в конструкторе нет
 *     и секции негде появиться.
 *
 * Что здесь НЕ проверяется (сказано честно):
 *   • палитра «Добавить секцию» и ЛОК этой кнопки живут в
 *     backend/services/constructor — их сторожит
 *     `src/__tests__/account-sections-page-scope.test.ts` там же;
 *   • что состав панели не поедет ЗАВТРА — это предмет `test:panel-canon`
 *     (обе секции внесены в conformance/panel-canon.json отдельным коммитом).
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections <тема>.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  PAGE_REGISTRY,
  ACCOUNT_SECTION_THEMES,
  getSystemPageRoute,
  getChromeKind,
  isVerbatimRoute,
} from "../page-registry";
import { migrateRevisionData } from "../../utils/revision-migrations";

const CANON_DUMP = resolve(__dirname, "panel-canon.mjs");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Две секции аккаунта — один и тот же контракт, разные страницы. */
const CASES = [
  {
    block: "AccountSection",
    label: "Личный кабинет",
    pageId: "page-profile",
    route: "account/profile",
    slug: "/account/profile",
    pageName: "Профиль",
    seedFile: "pages/profile.json",
    marker: "data-account-page",
  },
  {
    block: "OrdersSection",
    label: "Заказы",
    pageId: "page-orders",
    route: "account/orders",
    slug: "/account/orders",
    pageName: "Заказы",
    seedFile: "pages/orders.json",
    marker: "data-orders-page",
  },
] as const;

/** Ровно один параметр. Второго быть не должно — это и есть просьба тестера. */
const EXPECTED_FIELDS = ["colorScheme"] as const;

type FieldCanon = {
  type: string | null;
  label: string;
  visibility: string;
  objectFields?: Record<string, FieldCanon>;
};
type BlockCanon = { label: string; fields: Record<string, FieldCanon> };

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

describe("секции аккаунта — панель", () => {
  it("dist собран (pnpm build && pnpm build:blocks)", () => {
    expect(distReady).toBe(true);
  });

  describe.each(CASES)("$label ($block)", (c) => {
    it.each(THEMES)("%s: секция есть в конфиге конструктора", (theme) => {
      if (!distReady) return;
      expect(Object.keys(panels[theme] ?? {})).toContain(c.block);
    });

    it.each(THEMES)(`%s: подписана «${c.label}»`, (theme) => {
      if (!distReady) return;
      expect(panels[theme]?.[c.block]?.label).toBe(c.label);
    });

    it.each(THEMES)("%s: РОВНО один параметр — цветовая схема", (theme) => {
      if (!distReady) return;
      const fields = Object.keys(panels[theme]?.[c.block]?.fields ?? {});
      // Сообщение важнее равенства: лишний параметр надо назвать по имени.
      const extra = fields.filter((f) => !EXPECTED_FIELDS.includes(f as never));
      expect({ theme, block: c.block, extra }).toEqual({
        theme,
        block: c.block,
        extra: [],
      });
      expect(fields).toEqual([...EXPECTED_FIELDS]);
    });

    it.each(THEMES)(
      "%s: подпись и тип поля — как у той же схемы других секций",
      (theme) => {
        if (!distReady) return;
        const mine = panels[theme]?.[c.block]?.fields ?? {};
        // Формулировки не выдумываем: берём ровно то же поле у соседней секции,
        // которая его уже показывает (корзина). Разошлись — тест назовёт.
        const reference = panels[theme]?.CartSection?.fields ?? {};
        expect(mine.colorScheme).toEqual(reference.colorScheme);
        expect(mine.colorScheme?.label).toBe("Цветовая схема");
      },
    );

    it.each(THEMES)("%s: отступов в панели НЕТ (их задаёт вёрстка)", (theme) => {
      if (!distReady) return;
      expect(panels[theme]?.[c.block]?.fields?.padding).toBeUndefined();
    });
  });
});

describe("секции аккаунта — рендер", () => {
  describe.each(CASES)("$label ($block)", (c) => {
    const jobs = JSON.stringify([
      { block: c.block, props: { id: `${c.block}-1`, colorScheme: "3" } },
    ]);

    it.each(THEMES)(
      "%s: собственный порт темы есть в манифесте секций",
      (theme) => {
        const mf = resolve(
          SITES_ROOT,
          "dist",
          "theme-sections",
          theme,
          "manifest.json",
        );
        if (!existsSync(mf)) return; // отсутствие сборки ловит проверка выше
        const manifest = JSON.parse(readFileSync(mf, "utf-8")) as Record<
          string,
          string
        >;
        expect(Object.keys(manifest)).toContain(c.block);
      },
    );

    it.each(THEMES)("%s: рендерит непустую разметку своим портом", (theme) => {
      const mf = resolve(
        SITES_ROOT,
        "dist",
        "theme-sections",
        theme,
        "manifest.json",
      );
      if (!existsSync(mf)) return;
      const rows = JSON.parse(
        execFileSync("node", [RENDERER, theme, jobs], {
          cwd: SITES_ROOT,
          encoding: "utf-8",
          maxBuffer: 128 * 1024 * 1024,
        }),
      ) as Array<{ html?: string; error?: string; missing?: boolean }>;
      const row = rows[0];
      expect(row?.error).toBeUndefined();
      expect(row?.missing).toBeFalsy();
      const html = row?.html ?? "";
      // Живая секция, а не заглушка: корень адресуем конструктору (клик по
      // превью открывает панель), схема приезжает классом.
      expect(html).toContain(`data-puck-component-id="${c.block}-1"`);
      expect(html).toContain("color-scheme-3");
      expect(html).toContain(c.marker);
    });
  });

  it.each(THEMES)("%s: «Личный кабинет» несёт форму профиля", (theme) => {
    const mf = resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json");
    if (!existsSync(mf)) return;
    const rows = JSON.parse(
      execFileSync(
        "node",
        [
          RENDERER,
          theme,
          JSON.stringify([
            { block: "AccountSection", props: { id: "AccountSection-1" } },
          ]),
        ],
        { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
      ),
    ) as Array<{ html?: string }>;
    const html = rows[0]?.html ?? "";
    // Тело личного кабинета, а не «Загрузка…»-скаффолд theme-base.
    expect(html).toContain("profile-form");
    expect(html).toContain("profile-phone");
    expect(html).toContain("btn-logout-profile");
  });

  it.each(THEMES)("%s: «Заказы» несут список заказов", (theme) => {
    const mf = resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json");
    if (!existsSync(mf)) return;
    const rows = JSON.parse(
      execFileSync(
        "node",
        [
          RENDERER,
          theme,
          JSON.stringify([
            { block: "OrdersSection", props: { id: "OrdersSection-1" } },
          ]),
        ],
        { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
      ),
    ) as Array<{ html?: string }>;
    const html = rows[0]?.html ?? "";
    expect(html).toContain("orders-list");
    expect(html).toContain("orders-empty");
    expect(html).toContain("orders-loading");
  });
});

describe("страницы аккаунта — заведены в реестре", () => {
  it.each(CASES)(
    "$pageId: запись реестра на маршруте $route",
    (c) => {
      const entry = PAGE_REGISTRY.find((e) => e.id === c.pageId);
      expect(entry).toBeDefined();
      expect(entry?.route).toBe(c.route);
      expect(entry?.chrome).toBe("full");
    },
  );

  it("«account» остаётся verbatim-первосегментом (/account, /account/order)", () => {
    // Записи страниц аккаунта — kind:'verbatim' (как page-product/page-cart):
    // они пересаживаются секциями через ACCOUNT_SECTION_THEMES-гейт, а не
    // через getContentPages. Иначе первый сегмент 'account' исчез бы из
    // множества verbatim, и хаб /account с /account/order поехали бы по
    // контентному пути — страницы, которых у ревизии нет вовсе.
    expect(isVerbatimRoute("account")).toBe(true);
    expect(isVerbatimRoute("account/order")).toBe(true);
    expect(isVerbatimRoute("account/orders")).toBe(true);
    expect(isVerbatimRoute("account/profile")).toBe(true);
  });

  it("все пять тем в ACCOUNT_SECTION_THEMES", () => {
    for (const t of THEMES) expect(ACCOUNT_SECTION_THEMES.has(t)).toBe(true);
  });

  it.each(CASES)("$pageId: превью резолвит страницу по id", (c) => {
    expect(getSystemPageRoute(c.pageId)).toBe(c.route);
    expect(getChromeKind(c.route)).toBe("full");
  });

  describe.each(CASES)("$label — манифесты тем", (c) => {
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
        const page = (manifest.pages ?? []).find((p) => p.id === c.pageId);
        expect(page).toBeDefined();
        expect(page?.name).toBe(c.pageName);
        expect(page?.slug).toBe(c.slug);
        expect(page?.contentFile).toBe(c.seedFile);
        expect(existsSync(resolve(pkg, c.seedFile))).toBe(true);
      },
    );
  });
});

describe("секции аккаунта — только на своих страницах", () => {
  describe.each(CASES)("$label ($block)", (c) => {
    it.each(THEMES)("%s: сид своей страницы несёт ровно одну секцию", (theme) => {
      const seed = JSON.parse(
        readFileSync(
          resolve(SITES_ROOT, "packages", `theme-${theme}`, c.seedFile),
          "utf-8",
        ),
      ) as { content?: Array<{ type?: string }> };
      const mine = (seed.content ?? []).filter((b) => b?.type === c.block);
      expect(mine).toHaveLength(1);
    });

    it.each(THEMES)("%s: ни один другой сид страниц её не содержит", (theme) => {
      const dir = resolve(SITES_ROOT, "packages", `theme-${theme}`, "pages");
      const guilty: string[] = [];
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        if (`pages/${file}` === c.seedFile) continue;
        const seed = JSON.parse(readFileSync(resolve(dir, file), "utf-8")) as {
          content?: Array<{ type?: string }>;
        };
        if ((seed.content ?? []).some((b) => b?.type === c.block))
          guilty.push(file);
      }
      expect({ theme, block: c.block, guilty }).toEqual({
        theme,
        block: c.block,
        guilty: [],
      });
    });
  });

  /** Ревизия «как у живого сайта»: главная + уже досеянный профиль без секции. */
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
      // Ровно то, что seedProfilePage положил живым сайтам ДО этой задачи:
      // шапка и подвал, тела страницы нет.
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

  it("сидер досевает секции ровно в свои страницы", () => {
    const after = migrateRevisionData(liveLike(), "rose") as {
      pages: Array<{ id: string; name?: string; slug?: string }>;
      pagesData: Record<string, { content: Array<{ type?: string }> }>;
    };

    for (const c of CASES) {
      expect(after.pages.map((p) => p.id)).toContain(c.pageId);
      const meta = after.pages.find((p) => p.id === c.pageId);
      expect(meta?.slug).toBe(c.slug);

      const own = after.pagesData[c.pageId]?.content ?? [];
      expect(own.filter((b) => b?.type === c.block)).toHaveLength(1);
      // Шапка и подвал на месте — страница редактируется целиком.
      expect(own.some((b) => b?.type === "Header")).toBe(true);
      expect(own.some((b) => b?.type === "Footer")).toBe(true);

      const elsewhere = Object.entries(after.pagesData)
        .filter(([id]) => id !== c.pageId)
        .filter(([, pd]) => (pd?.content ?? []).some((b) => b?.type === c.block))
        .map(([id]) => id);
      expect({ block: c.block, elsewhere }).toEqual({
        block: c.block,
        elsewhere: [],
      });
    }
  });

  it("секция ДОСЕВАЕТСЯ в уже существующий профиль (живые сайты)", () => {
    // Ключевой случай: seedProfilePage идемпотентен и на живом сайте выходит
    // раньше срока (страница уже есть) — значит секцию кладёт отдельный шаг.
    // Без него «Личный кабинет» остался бы пустым у всех, кто завёл сайт до
    // 14.09, и тестировщик увидел бы пустую страницу.
    const after = migrateRevisionData(liveLike(), "rose") as {
      pagesData: Record<string, { content: Array<{ type?: string }> }>;
    };
    const content = after.pagesData["page-profile"]?.content ?? [];
    expect(content.map((b) => b?.type)).toEqual([
      "Header",
      "AccountSection",
      "Footer",
    ]);
  });

  it("повторный прогон сидера ничего не удваивает", () => {
    const once = migrateRevisionData(liveLike(), "rose");
    const twice = migrateRevisionData(once, "rose") as {
      pages: Array<{ id: string }>;
      pagesData: Record<string, { content: Array<{ type?: string }> }>;
    };
    for (const c of CASES) {
      expect(twice.pages.filter((p) => p.id === c.pageId)).toHaveLength(1);
      expect(
        (twice.pagesData[c.pageId]?.content ?? []).filter(
          (b) => b?.type === c.block,
        ),
      ).toHaveLength(1);
    }
  });

  it("правки мерчанта переживают повторный прогон", () => {
    const edited = migrateRevisionData(
      {
        pages: [
          { id: "home", name: "Главная", slug: "/", role: "system" },
          {
            id: "page-profile",
            name: "Профиль",
            slug: "/account/profile",
            role: "system",
          },
          {
            id: "page-orders",
            name: "Заказы",
            slug: "/account/orders",
            role: "system",
          },
        ],
        pagesData: {
          home: { content: [], root: { props: {} }, zones: {} },
          "page-profile": {
            content: [
              { type: "Header", props: { id: "H-p" } },
              { type: "AccountSection", props: { id: "A-1", colorScheme: 4 } },
              { type: "Footer", props: { id: "F-p" } },
            ],
            root: { props: {} },
            zones: {},
          },
          "page-orders": {
            content: [
              { type: "Header", props: { id: "H-o" } },
              { type: "OrdersSection", props: { id: "O-1", colorScheme: 5 } },
              { type: "Footer", props: { id: "F-o" } },
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
    expect(
      edited.pagesData["page-profile"]?.content.find(
        (b) => b?.type === "AccountSection",
      )?.props?.colorScheme,
    ).toBe(4);
    expect(
      edited.pagesData["page-orders"]?.content.find(
        (b) => b?.type === "OrdersSection",
      )?.props?.colorScheme,
    ).toBe(5);
  });

  it("скрытую секцию сидер не дублирует и не открывает обратно", () => {
    // Удалить секцию мерчант не может (NON_DELETABLE в конструкторе), а вот
    // скрыть «глазом» — да. Скрытие живёт в props.hidden, блок остаётся в
    // контенте: сидер обязан увидеть его и пройти мимо, иначе каждый прогон
    // подкладывал бы второй экземпляр и включал секцию обратно.
    const after = migrateRevisionData(
      {
        pages: [
          { id: "home", name: "Главная", slug: "/", role: "system" },
          {
            id: "page-profile",
            name: "Профиль",
            slug: "/account/profile",
            role: "system",
          },
          {
            id: "page-orders",
            name: "Заказы",
            slug: "/account/orders",
            role: "system",
          },
        ],
        pagesData: {
          home: { content: [], root: { props: {} }, zones: {} },
          "page-profile": {
            content: [
              { type: "Header", props: { id: "H-p" } },
              {
                type: "AccountSection",
                props: { id: "A-1", hidden: true },
              },
              { type: "Footer", props: { id: "F-p" } },
            ],
            root: { props: {} },
            zones: {},
          },
          "page-orders": {
            content: [
              { type: "Header", props: { id: "H-o" } },
              { type: "OrdersSection", props: { id: "O-1", hidden: true } },
              { type: "Footer", props: { id: "F-o" } },
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
    for (const c of CASES) {
      const mine = (after.pagesData[c.pageId]?.content ?? []).filter(
        (b) => b?.type === c.block,
      );
      expect(mine).toHaveLength(1);
      expect(mine[0]?.props?.hidden).toBe(true);
    }
  });
});
