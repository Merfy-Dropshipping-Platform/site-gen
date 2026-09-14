/**
 * Секция «Избранное» — живёт ТОЛЬКО на странице «Избранное», и в её панели
 * ровно два параметра.
 *
 * Откуда проверка. Тестировщик 14.09: «Для страницы Избранное в блоке Тема
 * создать исключительно там секцию Избранное. В сайдбаре только цветовая схема
 * и отступы». Два требования, и оба молча ломаются разными способами:
 *
 *   • состав панели — правится в одном файле puckConfig, а видит его тестер
 *     через день (ровно та болезнь, из-за которой появился panel-canon);
 *   • «только на этой странице» — держится не на одном флаге, а на трёх
 *     местах сразу: блока нет в палитре конструктора (PUPA_BLOCK_ALLOWLIST),
 *     он есть в сиде ОДНОЙ страницы и его сеет ОДИН сидер ревизий. Стоит
 *     любому из трёх поехать — секция всплывает на главной, и гард обязан это
 *     назвать.
 *
 * Что здесь НЕ проверяется (сказано честно):
 *   • палитра конструктора живёт в другом репозитории
 *     (backend/services/constructor) — её сторожит
 *     `src/__tests__/wishlist-section-page-scope.test.ts` там же;
 *   • что состав панели не поедет ЗАВТРА — это предмет `test:panel-canon`
 *     (секция внесена в conformance/panel-canon.json отдельным коммитом).
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  PAGE_REGISTRY,
  getSystemPageRoute,
  getChromeKind,
} from "../page-registry";
import { migrateRevisionData } from "../../utils/revision-migrations";

const CANON_DUMP = resolve(__dirname, "panel-canon.mjs");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

const BLOCK = "WishlistSection";
const PAGE_ID = "page-wishlist";
const PAGE_ROUTE = "wishlist";
const SEED_FILE = "pages/wishlist.json";

/** Ровно два параметра, ровно в этом порядке. Третьего быть не должно. */
const EXPECTED_FIELDS = ["padding", "colorScheme"] as const;

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

describe("секция «Избранное» — панель", () => {
  it("dist собран (pnpm build && pnpm build:blocks)", () => {
    expect(distReady).toBe(true);
  });

  it.each(THEMES)("%s: секция есть в конфиге конструктора", (theme) => {
    if (!distReady) return;
    expect(Object.keys(panels[theme] ?? {})).toContain(BLOCK);
  });

  it.each(THEMES)("%s: подписана «Избранное»", (theme) => {
    if (!distReady) return;
    expect(panels[theme]?.[BLOCK]?.label).toBe("Избранное");
  });

  it.each(THEMES)(
    "%s: РОВНО два параметра — отступы и цветовая схема",
    (theme) => {
      if (!distReady) return;
      const fields = Object.keys(panels[theme]?.[BLOCK]?.fields ?? {});
      // Сообщение важнее равенства: лишний параметр надо назвать по имени.
      const extra = fields.filter((f) => !EXPECTED_FIELDS.includes(f as never));
      expect({ theme, extra }).toEqual({ theme, extra: [] });
      expect(fields).toEqual([...EXPECTED_FIELDS]);
    },
  );

  it.each(THEMES)(
    "%s: подписи и типы — как у тех же полей других секций",
    (theme) => {
      if (!distReady) return;
      const mine = panels[theme]?.[BLOCK]?.fields ?? {};
      // Формулировки не выдумываем: берём ровно те же поля у соседней секции,
      // которая эту пару уже показывает (корзина). Разошлись — тест назовёт.
      const reference = panels[theme]?.CartSection?.fields ?? {};
      expect(mine.padding).toEqual(reference.padding);
      expect(mine.colorScheme).toEqual(reference.colorScheme);
      expect(mine.padding?.label).toBe("Отступы");
      expect(mine.colorScheme?.label).toBe("Цветовая схема");
    },
  );
});

describe("секция «Избранное» — рендер", () => {
  const jobs = JSON.stringify([
    {
      block: BLOCK,
      props: {
        id: `${BLOCK}-1`,
        colorScheme: "2",
        padding: { top: 40, bottom: 40 },
      },
    },
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
      expect(Object.keys(manifest)).toContain(BLOCK);
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
    // превью открывает панель), схема приезжает классом, отступы — стилем.
    expect(html).toContain(`data-puck-component-id="${BLOCK}-1"`);
    expect(html).toContain("color-scheme-2");
    expect(html).toContain("padding-top:40px");
    expect(html).toContain("data-wishlist-page");
    // Тело избранного, а не «Загрузка…»-скаффолд theme-base.
    expect(html).toContain("data-wishlist-grid");
    expect(html).toContain("data-wishlist-empty");
  });
});

describe("страница «Избранное» — заведена в реестре", () => {
  it("запись реестра: контентная страница маршрута /wishlist", () => {
    const entry = PAGE_REGISTRY.find((e) => e.id === PAGE_ID);
    expect(entry).toBeDefined();
    expect(entry?.route).toBe(PAGE_ROUTE);
    expect(entry?.kind).toBe("content");
    expect(entry?.chrome).toBe("full");
    // Пересадка только поверх СВОЕГО шелла: без wishlist/index.html страница
    // молча пропускается, а не подменяется главной.
    expect(entry?.requireOwnShell).toBe(true);
  });

  it("превью резолвит страницу по id", () => {
    expect(getSystemPageRoute(PAGE_ID)).toBe(PAGE_ROUTE);
    expect(getChromeKind(PAGE_ROUTE)).toBe("full");
  });

  it.each(THEMES)(
    "%s: манифест темы объявляет страницу с существующим сидом",
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
      expect(page?.name).toBe("Избранное");
      expect(page?.slug).toBe("/wishlist");
      expect(page?.contentFile).toBe(SEED_FILE);
      expect(existsSync(resolve(pkg, SEED_FILE))).toBe(true);
    },
  );
});

describe("секция «Избранное» — только на своей странице", () => {
  it.each(THEMES)("%s: сид страницы несёт ровно одну секцию", (theme) => {
    const seed = JSON.parse(
      readFileSync(
        resolve(SITES_ROOT, "packages", `theme-${theme}`, SEED_FILE),
        "utf-8",
      ),
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
      if ((seed.content ?? []).some((b) => b?.type === BLOCK))
        guilty.push(file);
    }
    expect({ theme, guilty }).toEqual({ theme, guilty: [] });
  });

  it("сидер ревизий кладёт секцию только в page-wishlist", () => {
    const before = {
      pages: [{ id: "home", name: "Главная", slug: "/", role: "system" }],
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
      },
    };
    const after = migrateRevisionData(before, "rose") as {
      pages: Array<{ id: string; name?: string; slug?: string }>;
      pagesData: Record<string, { content: Array<{ type?: string }> }>;
    };

    expect(after.pages.map((p) => p.id)).toContain(PAGE_ID);
    const page = after.pages.find((p) => p.id === PAGE_ID);
    expect(page?.name).toBe("Избранное");
    expect(page?.slug).toBe("/wishlist");

    const own = after.pagesData[PAGE_ID]?.content ?? [];
    expect(own.filter((b) => b?.type === BLOCK)).toHaveLength(1);
    // Шапка и подвал на месте — страница редактируется целиком, как корзина.
    expect(own.some((b) => b?.type === "Header")).toBe(true);
    expect(own.some((b) => b?.type === "Footer")).toBe(true);

    const elsewhere = Object.entries(after.pagesData)
      .filter(([id]) => id !== PAGE_ID)
      .filter(([, pd]) => (pd?.content ?? []).some((b) => b?.type === BLOCK))
      .map(([id]) => id);
    expect(elsewhere).toEqual([]);
  });

  it("повторный прогон сидера ничего не удваивает", () => {
    const once = migrateRevisionData(
      {
        pages: [{ id: "home", name: "Главная", slug: "/", role: "system" }],
        pagesData: {
          home: {
            content: [
              { type: "Header", props: { id: "Header-1" } },
              { type: "Footer", props: { id: "Footer-1" } },
            ],
            root: { props: {} },
            zones: {},
          },
        },
      },
      "rose",
    );
    const twice = migrateRevisionData(once, "rose") as {
      pages: Array<{ id: string }>;
      pagesData: Record<string, { content: Array<{ type?: string }> }>;
    };
    expect(twice.pages.filter((p) => p.id === PAGE_ID)).toHaveLength(1);
    expect(
      (twice.pagesData[PAGE_ID]?.content ?? []).filter(
        (b) => b?.type === BLOCK,
      ),
    ).toHaveLength(1);
  });

  it("правки мерчанта переживают повторный прогон", () => {
    const edited = migrateRevisionData(
      {
        pages: [
          { id: "home", name: "Главная", slug: "/", role: "system" },
          { id: PAGE_ID, name: "Избранное", slug: "/wishlist", role: "system" },
        ],
        pagesData: {
          home: { content: [], root: { props: {} }, zones: {} },
          [PAGE_ID]: {
            content: [
              { type: "Header", props: { id: "Header-w" } },
              {
                type: BLOCK,
                props: {
                  id: "W-1",
                  colorScheme: 4,
                  padding: { top: 8, bottom: 8 },
                },
              },
              { type: "Footer", props: { id: "Footer-w" } },
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
    const block = (edited.pagesData[PAGE_ID]?.content ?? []).find(
      (b) => b?.type === BLOCK,
    );
    expect(block?.props?.colorScheme).toBe(4);
    expect(block?.props?.padding).toEqual({ top: 8, bottom: 8 });
  });
});
