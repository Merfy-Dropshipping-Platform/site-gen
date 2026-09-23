/**
 * @jest-environment jsdom
 *
 * Меню шапки на компьютере раскрывается НАЖАТИЕМ, не наведением — пять тем,
 * «Выпадающее» и «Расширенное» меню, третий уровень.
 *
 * Владелец 24.09 (скрины конструктора, bloom): «на всех темах для появления
 * расширенного меню и подменю и подпунктов они должны работать не по ховеру,
 * а по клику». Было: чистый CSS `group-hover` (по пункту 25 прежнего
 * документа — «на десктопе по наведению»). Стало: пункт с подменю — кнопка
 * `data-nav-menu-toggle` в обёртке `data-nav-menu`; нажатие ставит обёртке
 * `data-open`, панель видна по `group-data-[open]/…`. Кнопка, а не ссылка:
 * превью конструктора перехватывает нажатие любой ссылки и переключает
 * страницу — пункт-ссылка «Каталог» уводил бы на каталог вместо меню.
 *
 * Проверка — настоящий рендер шапки темы и настоящий общий обработчик
 * (packages/theme-base/runtime/nav-submenu-toggle.ts) в jsdom. CSS jsdom не
 * применяет, поэтому отдельно сверяется связка: класс показа панели ссылается
 * на ту же обёртку, которой обработчик ставит `data-open`.
 */
import { execFileSync } from "node:child_process";

import { NAV_SUBMENU_TOGGLE_SOURCE } from "../../../packages/theme-base/runtime/nav-submenu-toggle";

const RENDERER = require.resolve("./render-theme-sections.mjs");
const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"] as const;

const NAV = [
  {
    label: "Каталог",
    href: "/catalog",
    submenu: [
      {
        label: "Наушники",
        href: "/collections/naushniki",
        submenu: [{ label: "TWS", href: "/collections/tws" }],
      },
      { label: "Колонки", href: "/collections/kolonki" },
    ],
  },
  {
    label: "Бренды",
    href: "/brands",
    submenu: [{ label: "Sony", href: "/collections/sony" }],
  },
  { label: "О нас", href: "/about" },
];

const рендеры = new Map<string, string>();
function шапка(theme: string, menuType: string): string {
  const ключ = `${theme} ${menuType}`;
  if (!рендеры.has(ключ)) {
    const props = {
      id: "Header-1",
      menuType,
      logoPosition: "center-left",
      navigationLinks: NAV,
      links: NAV,
    };
    const out = execFileSync(
      "node",
      [
        RENDERER,
        theme,
        JSON.stringify([{ block: "Header", props, live: true }]),
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
    if (res.error) throw new Error(`${theme}: ${res.error}`);
    рендеры.set(ключ, res.html ?? "");
  }
  return рендеры.get(ключ) ?? "";
}

function показать(theme: string, menuType: string): void {
  document.body.innerHTML = шапка(theme, menuType).replace(
    /<script[^>]*>[\s\S]*?<\/script>/g,
    "",
  );
}

/** Первая кнопка пункта с этим названием (шапка рисует раскладки в нескольких копиях). */
function кнопка(название: string): HTMLElement {
  const el = [
    ...document.querySelectorAll<HTMLElement>("[data-nav-menu-toggle]"),
  ].find((b) => (b.textContent ?? "").trim().startsWith(название));
  if (!el) throw new Error(`нет кнопки «${название}»`);
  return el;
}

/** Названия открытых пунктов. */
const открыты = () =>
  [...document.querySelectorAll("[data-nav-menu][data-open]")].map((g) =>
    (
      g.querySelector(":scope > [data-nav-menu-toggle]")?.textContent ?? ""
    ).trim(),
  );

const нажать = (el: Element) =>
  el.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );

function навести(el: Element): void {
  for (const тип of ["pointerover", "pointerenter", "mouseover", "mouseenter"])
    el.dispatchEvent(new MouseEvent(тип, { bubbles: true }));
}

beforeAll(() => {
  (0, eval)(NAV_SUBMENU_TOGGLE_SOURCE);
});

describe.each(THEMES)("меню шапки раскрывается нажатием — %s", (theme) => {
  describe.each(["dropdown", "mega-menu"])("%s", (menuType) => {
    beforeEach(() => показать(theme, menuType));

    it("до нажатия всё закрыто, наведение ничего не открывает", () => {
      навести(кнопка("Каталог"));
      expect({
        открыты: открыты(),
        раскрыт: кнопка("Каталог").getAttribute("aria-expanded"),
      }).toEqual({ открыты: [], раскрыт: "false" });
    });

    it("нажатие открывает пункт, повторное — закрывает", () => {
      нажать(кнопка("Каталог"));
      const послеПервого = {
        открыты: открыты(),
        раскрыт: кнопка("Каталог").getAttribute("aria-expanded"),
      };
      нажать(кнопка("Каталог"));
      expect({ послеПервого, послеВторого: открыты() }).toEqual({
        послеПервого: { открыты: ["Каталог"], раскрыт: "true" },
        послеВторого: [],
      });
    });

    it("другой пункт закрывает прежний", () => {
      нажать(кнопка("Каталог"));
      нажать(кнопка("Бренды"));
      expect(открыты()).toEqual(["Бренды"]);
    });

    it("нажатие мимо меню и Esc закрывают всё", () => {
      нажать(кнопка("Каталог"));
      нажать(document.body);
      const послеМимо = открыты();
      нажать(кнопка("Каталог"));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect({ послеМимо, послеEsc: открыты() }).toEqual({
        послеМимо: [],
        послеEsc: [],
      });
    });

    it("нажатие мимо закрывает, даже когда превью глушит всплытие click", () => {
      // Перехватчик превью при захвате делает stopPropagation на своих
      // подсекциях — «click» до обработчика меню не доходит.
      const глушитель = (e: Event) => e.stopPropagation();
      нажать(кнопка("Каталог"));
      document.addEventListener("click", глушитель, true);
      try {
        document.body.dispatchEvent(
          new MouseEvent("pointerdown", { bubbles: true }),
        );
        нажать(document.body);
      } finally {
        document.removeEventListener("click", глушитель, true);
      }
      expect(открыты()).toEqual([]);
    });

    it("панель показывается по той же обёртке, что хранит data-open", () => {
      const панели = [
        ...document.querySelectorAll<HTMLElement>(
          '[class*="group-data-[open]/"]',
        ),
      ];
      const чужие = панели
        .map((p) => {
          const группа = /group-data-\[open\]\/([a-z0-9]+):/.exec(
            p.className,
          )?.[1];
          const обёртка = p.parentElement?.closest("[data-nav-menu]");
          const своя = обёртка?.classList.contains(`group/${группа}`);
          // видна по той же группе и не раскрывается наведением
          return своя && !/group-hover\//.test(p.className)
            ? null
            : p.className;
        })
        .filter((x) => x !== null);
      expect({ панелей: панели.length > 0, чужие }).toEqual({
        панелей: true,
        чужие: [],
      });
    });
  });

  it("выпадающее: третий уровень — нажатием на подпункт, родитель остаётся открыт", () => {
    показать(theme, "dropdown");
    нажать(кнопка("Каталог"));
    нажать(кнопка("Наушники"));
    const оба = открыты();
    нажать(кнопка("Наушники"));
    expect({ оба, послеПовтора: открыты() }).toEqual({
      оба: ["Каталог", "Наушники"],
      послеПовтора: ["Каталог"],
    });
  });

  it("подпункт без вложенных остаётся ссылкой", () => {
    показать(theme, "dropdown");
    const колонки = [...document.querySelectorAll("a")].find(
      (a) => (a.textContent ?? "").trim() === "Колонки",
    );
    expect(колонки?.getAttribute("href")).toBe("/collections/kolonki");
  });
});
