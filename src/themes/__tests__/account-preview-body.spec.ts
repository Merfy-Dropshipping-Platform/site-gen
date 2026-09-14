/**
 * Превью страниц «Личный кабинет» и «Заказы» показывает ТЕЛО страницы,
 * а не форму входа.
 *
 * Откуда проверка. Владелец 14.09: «На странице Личный кабинет отображать
 * <…> саму страницу в магазине кабинета, когда уже вошёл в него», то же про
 * «Заказы». Замер бага в конструкторе (iframe, flux, localhost):
 *   preview?page=page-profile → preview?page=%2Flogin
 *   узлы ["Header-home","Footer-home"], текст «ВХОД В АККАУНТ»
 * Причина: inline-клиент секции начинает с гость-гейта
 * `if (!A.getToken()) navTo('/login…')`, а `navTo` внутри iframe переписывает
 * `?page=` у САМОГО превью. Мерчант видел форму входа и не мог настроить
 * секцию.
 *
 * Почему гард ИСПОЛНЯЕТ скрипт, а не грепает его. Баг не в разметке — разметка
 * как раз приезжала верная (в сыром HTML превью были и `AccountSection-…`, и
 * «Основные данные»). Ломалось ПОВЕДЕНИЕ в браузере. Строчный гард («в файле
 * есть слово __MERFY_PREVIEW_ACCOUNT__») зеленел бы и на нерабочей правке —
 * достаточно поставить проверку ПОСЛЕ гейта. Поэтому здесь крошечный DOM-стенд
 * и настоящий прогон обоих inline-скриптов секции в двух контекстах:
 *   • превью  — глобал есть  → навигации нет, тело заполнено;
 *   • витрина — глобала нет, покупатель гость → навигация на /login ЕСТЬ.
 * Второй случай так же важен, как первый: он сторожит, что послабление превью
 * не сняло защиту витрины.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync as sh } from "node:child_process";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import {
  PREVIEW_ACCOUNT_DEMO,
  PREVIEW_ACCOUNT_GLOBAL,
  PREVIEW_ACCOUNT_INLINE,
  PREVIEW_ACCOUNT_MARKER,
  injectPreviewAccountGlobal,
} from "../../common/preview-account-inline";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Префикс auth-глобала темы: window.__roseAuth, window.__fluxAuth, … */
const AUTH_GLOBALS = THEMES.map((t) => `__${t}Auth`);

// ── Крошечный DOM ───────────────────────────────────────────────────────────
// Ровно те возможности, которыми пользуются оба inline-скрипта секций. Больше
// не нужно, а меньше — скрипт упадёт, и тест это покажет (падение = красный).

class FakeClassList {
  private readonly set: Set<string>;
  constructor(initial: string) {
    this.set = new Set(initial.split(/\s+/).filter(Boolean));
  }
  add(...c: string[]) { for (const x of c) this.set.add(x); }
  remove(...c: string[]) { for (const x of c) this.set.delete(x); }
  contains(c: string) { return this.set.has(c); }
  toString() { return [...this.set].join(" "); }
}

class FakeEl {
  classList: FakeClassList;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  textContent = "";
  value = "";
  innerHTML = "";
  className = "";
  disabled = false;
  children: FakeEl[] = [];
  listeners: Record<string, unknown[]> = {};
  constructor(public id = "", cls = "") {
    this.classList = new FakeClassList(cls);
    this.className = cls;
  }
  addEventListener(type: string, fn: unknown) {
    (this.listeners[type] ??= []).push(fn);
  }
  appendChild(el: FakeEl) { this.children.push(el); return el; }
  querySelector() { return new FakeEl(); }
  get hidden() { return this.classList.contains("hidden"); }
}

interface Stand {
  window: Record<string, unknown>;
  document: Record<string, unknown>;
  els: Map<string, FakeEl>;
  navigations: string[];
}

/**
 * Стенд: собираем элементы по id, встречающимся в разметке секции. id читаем
 * из САМОГО HTML (`id="…"`), а не из списка в тесте — иначе переименование в
 * теме тихо обошло бы проверку.
 */
function makeStand(html: string, opts: { preview: boolean; loggedIn: boolean }): Stand {
  const els = new Map<string, FakeEl>();
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) {
    const id = m[1];
    const cls = new RegExp(`id="${id}"[^>]*class="([^"]*)"`).exec(html)?.[1] ?? "";
    const clsBefore = new RegExp(`class="([^"]*)"[^>]*id="${id}"`).exec(html)?.[1] ?? "";
    els.set(id, new FakeEl(id, cls || clsBefore));
  }
  const navigations: string[] = [];

  const auth = {
    getToken: () => (opts.loggedIn ? "token" : null),
    isLoggedIn: () => opts.loggedIn,
    fetchMe: async () => (opts.loggedIn ? { email: "real@shop.test", phone: "+7 111" } : null),
    fetchOrders: async () => ({ success: true, data: [] }),
    updateProfile: async () => ({ success: true }),
    logout: async () => undefined,
  };

  const location = {
    _href: "https://gateway.test/api/sites/S/preview?page=page-profile",
    get href() { return this._href; },
    set href(v: string) { navigations.push(v); this._href = v; },
  };

  const document: Record<string, unknown> = {
    getElementById: (id: string) => els.get(id) ?? null,
    createElement: (tag: string) => new FakeEl("", ""),
    querySelector: () => new FakeEl(),
    querySelectorAll: () => [],
    addEventListener: () => undefined,
  };

  const window: Record<string, unknown> = { document, location, navigator: { userAgent: "jest" } };
  window.window = window;
  window.self = window;
  // Превью = iframe: ровно это условие читает navTo внутри секции.
  window.top = opts.preview ? { different: true } : window;
  for (const g of AUTH_GLOBALS) window[g] = auth;
  if (opts.preview) window[PREVIEW_ACCOUNT_GLOBAL] = PREVIEW_ACCOUNT_DEMO;

  return { window, document, els, navigations };
}

/** Выполнить ВСЕ inline-скрипты секции на стенде. */
function runSection(html: string, stand: Stand): void {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  expect(scripts.length).toBeGreaterThan(0);
  const sandbox: Record<string, unknown> = {
    window: stand.window,
    document: stand.document,
    location: stand.window.location,
    URL,
    console,
    setTimeout: (fn: () => void) => { fn(); return 0; },
    Date,
    Array,
    JSON,
    encodeURIComponent,
  };
  sandbox.globalThis = sandbox;
  for (const code of scripts) runInNewContext(code, sandbox);
}

/** Рендер секции портом темы (тот же путь, что account-sections.spec). */
function render(theme: string, block: string): string | null {
  const mf = resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json");
  if (!existsSync(mf)) return null;
  const rows = JSON.parse(
    execFileSync(
      "node",
      [RENDERER, theme, JSON.stringify([{ block, props: { id: `${block}-1` } }])],
      { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
    ),
  ) as Array<{ html?: string; error?: string }>;
  expect(rows[0]?.error).toBeUndefined();
  return rows[0]?.html ?? "";
}

const built = existsSync(resolve(SITES_ROOT, "dist", "theme-sections", "flux", "manifest.json"));

describe("превью кабинета — сборка на месте", () => {
  it("dist/theme-sections собран (pnpm build:theme-sections:all)", () => {
    expect(built).toBe(true);
  });
});

describe("«Личный кабинет» в превью показывает тело, а не вход", () => {
  it.each(THEMES)("%s: превью НЕ уходит на /login и заполняет форму", (theme) => {
    const html = render(theme, "AccountSection");
    if (html === null) return;
    const stand = makeStand(html, { preview: true, loggedIn: false });
    runSection(html, stand);

    expect(stand.navigations).toEqual([]);
    expect(stand.els.get("profile-form")?.hidden).toBe(false);
    expect(stand.els.get("profile-loading")?.hidden).toBe(true);
    expect(stand.els.get("profile-actions")?.style.display).toBe("");
    expect(stand.els.get("profile-email")?.value).toBe(PREVIEW_ACCOUNT_DEMO.customer.email);
    expect(stand.els.get("profile-phone")?.value).toBe(PREVIEW_ACCOUNT_DEMO.customer.phone);
    expect(stand.els.get("profile-email-display")?.textContent).toBe(
      PREVIEW_ACCOUNT_DEMO.customer.email,
    );
  });

  it.each(THEMES)("%s: витрина без глобала по-прежнему гонит гостя на /login", (theme) => {
    const html = render(theme, "AccountSection");
    if (html === null) return;
    const stand = makeStand(html, { preview: false, loggedIn: false });
    runSection(html, stand);

    expect(stand.navigations).toEqual(["/login?redirect=/account/profile"]);
    // Тело гостю не показали.
    expect(stand.els.get("profile-form")?.hidden).toBe(true);
  });
});

describe("«Заказы» в превью показывают список, а не вход", () => {
  it.each(THEMES)("%s: превью НЕ уходит на /login и рисует демо-заказы", (theme) => {
    const html = render(theme, "OrdersSection");
    if (html === null) return;
    const stand = makeStand(html, { preview: true, loggedIn: false });
    runSection(html, stand);

    expect(stand.navigations).toEqual([]);
    const list = stand.els.get("orders-list");
    expect(list?.hidden).toBe(false);
    expect(list?.children).toHaveLength(PREVIEW_ACCOUNT_DEMO.orders.length);
    const rows = (list?.children ?? []).map((c) => c.innerHTML).join("\n");
    for (const o of PREVIEW_ACCOUNT_DEMO.orders) expect(rows).toContain(o.orderNumber);
    expect(stand.els.get("orders-loading")?.hidden).toBe(true);
    expect(stand.els.get("orders-empty")?.hidden).toBe(true);
    expect(stand.els.get("orders-email")?.textContent).toBe(
      PREVIEW_ACCOUNT_DEMO.customer.email,
    );
  });

  it.each(THEMES)("%s: витрина без глобала по-прежнему гонит гостя на /login", (theme) => {
    const html = render(theme, "OrdersSection");
    if (html === null) return;
    const stand = makeStand(html, { preview: false, loggedIn: false });
    runSection(html, stand);

    expect(stand.navigations).toEqual(["/login?redirect=/account/orders"]);
    expect(stand.els.get("orders-list")?.hidden).toBe(true);
  });
});

describe("глобал ставит только превью", () => {
  const src = (p: string) => readFileSync(resolve(SITES_ROOT, p), "utf-8");

  it("инжектор превью действительно вставляет глобал", () => {
    const controller = src("src/controllers/preview.controller.ts");
    expect(controller).toContain("injectPreviewAccountGlobal");
    expect(PREVIEW_ACCOUNT_INLINE).toContain(PREVIEW_ACCOUNT_GLOBAL);
    expect(PREVIEW_ACCOUNT_INLINE).toContain(PREVIEW_ACCOUNT_DEMO.customer.email);
  });

  /**
   * Ровно эта проверка отсутствовала на первом заходе, и правка уехала
   * нерабочей: маркером идемпотентности было ИМЯ глобала, а оно уже есть в
   * ЧТЕНИИ внутри скрипта секции → инжект молча пропускался, и превью висело
   * на «Загрузка…». Поймал только браузер. Теперь ловит гард.
   */
  it.each(["AccountSection", "OrdersSection"])(
    "вставляет глобал в страницу, где секция %s уже УПОМИНАЕТ его имя",
    (block) => {
      const section = render("flux", block);
      if (section === null) return;
      expect(section).toContain(PREVIEW_ACCOUNT_GLOBAL); // чтение внутри секции
      const page = `<!doctype html><html><head><title>t</title></head><body>${section}</body></html>`;
      const out = injectPreviewAccountGlobal(page);
      expect(out).toContain(PREVIEW_ACCOUNT_MARKER);
      expect(out.indexOf(PREVIEW_ACCOUNT_MARKER)).toBeLessThan(out.indexOf("<body"));
    },
  );

  it("второй прогон инжектора глобал не удваивает", () => {
    const page = "<html><head></head><body></body></html>";
    const once = injectPreviewAccountGlobal(page);
    const twice = injectPreviewAccountGlobal(once);
    expect(twice).toBe(once);
    expect(twice.split(PREVIEW_ACCOUNT_MARKER)).toHaveLength(2);
  });

  it("сборка витрины глобал НЕ несёт", () => {
    // build.service — единственный, кто пишет <head> живых страниц.
    // Появится импорт — демо-кабинет уедет на витрину.
    const build = src("src/generator/build.service.ts");
    expect(build).not.toContain(PREVIEW_ACCOUNT_GLOBAL);
    expect(build).not.toContain("preview-account-inline");
  });

  it("инжектор зовёт РОВНО один файл — контроллер превью", () => {
    // Шире предыдущей проверки: не «build.service чист», а «во всём сервисе
    // глобал ставит только превью». Любой новый потребитель (сборка витрины,
    // пересадка страниц, SEO-инжект) обязан явиться сюда и объясниться.
    const out = sh(
      "grep",
      ["-rln", "preview-account-inline", "src"],
      { cwd: SITES_ROOT, encoding: "utf-8" },
    )
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((f) => !f.includes("__tests__"))
      .sort();
    // Сам модуль своё имя не упоминает — в списке только импортёры.
    expect(out).toEqual(["src/controllers/preview.controller.ts"]);
  });

  it("демо-данные — заглушки, а не чьи-то настоящие", () => {
    expect(PREVIEW_ACCOUNT_DEMO.customer.email).toMatch(/@example\.com$/);
    for (const o of PREVIEW_ACCOUNT_DEMO.orders) {
      expect(o.orderNumber).toMatch(/^DEMO-/);
    }
  });
});
