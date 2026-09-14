/**
 * На собранной странице витрины РОВНО ОДНА шапка и РОВНО ОДИН подвал.
 *
 * Откуда проверка. Замер живых витрин 14.09: на каждой не-главной странице
 * каждой темы в DOM по ДВЕ шапки — `/login`, `/wishlist`, `/catalog`, `/cart`,
 * `/account/orders`, `/account/profile`, `/about`. 34 сочетания страница×тема
 * из 35; чистой оказалась только главная.
 *
 * Причина (замерена, а не предположена). Шапки не соседи — они ВЛОЖЕНЫ:
 *
 *   <div data-puck-component-id="Header-login" data-<тема>-header>   ← блок страницы
 *     <div class="overflow-visible">
 *       <div data-puck-component-id="Header-1" data-<тема>-header>   ← хром
 *         …<header data-nt="<тема>-header">…</header>
 *
 * `composeContentPagesIntoDist` кладёт на страницу мерчантский блок «Шапка» из
 * ревизии (корень — div с `data-puck-component-id`). Следом `applyChromeToDist`
 * зовёт `injectChromeIntoHtml`, а тот ищет `HEADER_NT_RE` — ВНУТРЕННИЙ
 * `<header data-nt=…>` — и подменяет его ЦЕЛЫМ блоком шапки, у которого есть
 * свой корневой div. Внутренность блока заменяется блоком целиком → вложение.
 *
 * Хуже того, приём НЕ идемпотентен по построению: `current` — это внутренний
 * `<header>`, `target` — весь блок, они не равны НИКОГДА, поэтому проверка
 * «уже целевой → не пишем» не срабатывает и каждый прогон добавляет ещё один
 * слой (замерено: 1 → 2 → 3).
 *
 * Почему НЕ `build.service.ts:2166` (`content[i] = { ...homeHeader }`), на
 * который падало подозрение: синхронизация копирует объект вместе с `props.id`
 * и потому объясняет, КАКИЕ id видны (`Header-1`, `header-flux`), но не сам
 * дубль — узлов было бы два и с разными id, и с одинаковыми. Вдобавок `/login`
 * этой синхронизации вообще не проходит: она идёт по astro-страницам ревизии, а
 * `login` — в `STATIC_TEMPLATE_PAGES`. Дубль там всё равно есть.
 *
 * Проверка идёт по НАСТОЯЩЕМУ пути: реальный рендер блока «Шапка» портом темы
 * (`render-theme-sections.mjs`), реальная сборка страницы (`composeV2Page`) и
 * реальная инъекция хрома (`injectChromeIntoHtml`) — те же функции, что зовёт
 * `applyChromeToDist` на сборке витрины. Ни одна не заменена фикстурой.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { injectChromeIntoHtml } from "../chrome-assembler";
import { composeV2Page } from "../v2-page-composer";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Узлы-корни блока шапки/подвала (именно они несут id для конструктора). */
const headerNodes = (html: string): string[] =>
  html.match(/data-puck-component-id="(?:Header|header)[^"]*"/g) ?? [];
const footerNodes = (html: string): string[] =>
  html.match(/data-puck-component-id="(?:Footer|footer)[^"]*"/g) ?? [];

function sectionsBuilt(theme: string): boolean {
  return existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );
}

/** Реальный рендер блока портом темы. */
function render(theme: string, block: string, props: Record<string, unknown>): string {
  const rows = JSON.parse(
    execFileSync(
      "node",
      [RENDERER, theme, JSON.stringify([{ block, props }])],
      { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
    ),
  ) as Array<{ html?: string; error?: string; missing?: boolean }>;
  const row = rows[0];
  expect(row?.error).toBeUndefined();
  expect(row?.missing).toBeFalsy();
  return row?.html ?? "";
}

/**
 * Шелл темы: минимальный, но с тем, на что опирается `composeV2Page` —
 * `<body>` и последний `</footer>`. Тело между ними он и заменяет.
 */
const SHELL =
  `<!doctype html><html><head><title>шелл</title></head><body class="t">` +
  `<div data-puck-component-id="Header-shell" data-nt-shell>шапка шелла</div>` +
  `<main>тело шелла</main>` +
  `<footer data-puck-component-id="Footer-shell">подвал шелла</footer>` +
  `</body></html>`;

/** Страница, собранная ровно так, как её собирает live-цикл. */
function composePage(theme: string): { page: string; chromeHeader: string; chromeFooter: string } {
  // Блок страницы (из ревизии) и канон с главной — РАЗНЫЕ id, как на живом сайте.
  const pageHeader = render(theme, "Header", { id: "Header-login-999" });
  const pageFooter = render(theme, "Footer", { id: "Footer-login-999" });
  const chromeHeader = render(theme, "Header", { id: "Header-1" });
  const chromeFooter = render(theme, "Footer", { id: "Footer-1" });
  const page = composeV2Page({
    shellHtml: SHELL,
    blocksHtml: [pageHeader, "<section data-block=\"login-section\">тело</section>", pageFooter],
    blockTypes: ["Header", "LoginSection", "Footer"],
    blockSchemes: ["2", "2", "2"],
    assetPrefix: null,
  })!;
  return { page, chromeHeader, chromeFooter };
}

describe("собранная страница витрины — ровно одна шапка и один подвал", () => {
  it("секции тем собраны (pnpm build:theme-sections:all)", () => {
    for (const t of THEMES) expect(sectionsBuilt(t)).toBe(true);
  });

  describe.each(THEMES)("%s", (theme) => {
    it("САБОТАЖ-КАЛИБРОВКА: до инъекции шапка ровно одна, и цель — тоже одна", () => {
      if (!sectionsBuilt(theme)) return;
      const { page, chromeHeader, chromeFooter } = composePage(theme);
      // Если бы тут было 0, проверка «ровно одна после» проходила бы впустую.
      expect(headerNodes(page)).toHaveLength(1);
      expect(footerNodes(page)).toHaveLength(1);
      expect(headerNodes(chromeHeader)).toHaveLength(1);
      expect(footerNodes(chromeFooter)).toHaveLength(1);
      // Шелл вытеснен целиком: ни шапки, ни подвала шелла на странице нет.
      expect(page).not.toContain("Header-shell");
      expect(page).not.toContain("Footer-shell");
    });

    it("после инъекции хрома шапка ОДНА (а не вложенная пара)", () => {
      if (!sectionsBuilt(theme)) return;
      const { page, chromeHeader, chromeFooter } = composePage(theme);
      const out = injectChromeIntoHtml(page, {
        headerHtml: chromeHeader,
        footerHtml: chromeFooter,
      });
      expect(headerNodes(out)).toHaveLength(1);
      expect(footerNodes(out)).toHaveLength(1);
    });

    it("победил хром: на странице остаётся канон с главной, а не блок страницы", () => {
      if (!sectionsBuilt(theme)) return;
      const { page, chromeHeader, chromeFooter } = composePage(theme);
      const out = injectChromeIntoHtml(page, {
        headerHtml: chromeHeader,
        footerHtml: chromeFooter,
      });
      // Ради этого синхронизация и существует — единая навигация по сайту.
      expect(out).toContain('data-puck-component-id="Header-1"');
      expect(out).not.toContain('data-puck-component-id="Header-login-999"');
    });

    it("шапка идемпотентна БУКВАЛЬНО: повторный прогон не меняет ни байта", () => {
      if (!sectionsBuilt(theme)) return;
      const { page, chromeHeader } = composePage(theme);
      // Только шапка: именно её подмену чинит эта правка, и её контракт —
      // строгий. Прежний код не проходил эту проверку по построению
      // (сравнивал внутренний <header> с блоком целиком, равными они не
      // бывают) и добавлял по слою за прогон.
      const chrome = { headerHtml: chromeHeader, footerHtml: null };
      const once = injectChromeIntoHtml(page, chrome);
      const twice = injectChromeIntoHtml(once, chrome);
      const thrice = injectChromeIntoHtml(twice, chrome);
      expect(twice).toBe(once);
      expect(thrice).toBe(once);
      expect(headerNodes(once)).toHaveLength(1);
    });

    it("шапка и подвал остаются по одному и при повторных прогонах", () => {
      if (!sectionsBuilt(theme)) return;
      const { page, chromeHeader, chromeFooter } = composePage(theme);
      const chrome = { headerHtml: chromeHeader, footerHtml: chromeFooter };
      let html = page;
      for (let i = 0; i < 3; i++) html = injectChromeIntoHtml(html, chrome);
      expect(headerNodes(html)).toHaveLength(1);
      expect(footerNodes(html)).toHaveLength(1);
    });

    // ⚠️ ОТКРЫТЫЙ ДЕФЕКТ, НЕ ЧИНИТСЯ ЗДЕСЬ (замерен 14.09, отдельная задача).
    // `replaceLastFooter` подменяет только элемент `<footer>…</footer>`, тогда
    // как блок «Подвал» печатает рядом ещё и свои <style>/<script type=module>.
    // Соседи не заменяются и КОПЯТСЯ: страница растёт на ~7,6 КБ (rose) и
    // ~5,3 КБ (flux) за каждый прогон инъекции, число узлов при этом остаётся
    // равным одному. На живых витринах видно 4 hoisted-скрипта подвала
    // (rose/bloom/satin).
    //
    // Это ТА ЖЕ болезнь, что чинит эта ветка у шапки (цель — блок, подмена —
    // внутренний элемент), но у подвала своя функция и свой риск, а трогать
    // «заодно» соседний слой в этой ветке нельзя. Намеренно НЕ пишу тест,
    // фиксирующий текущее поведение: он узаконил бы дефект.
    it("подвал: число узлов не растёт (сам вес — открытый дефект, см. комментарий)", () => {
      if (!sectionsBuilt(theme)) return;
      const { page, chromeFooter } = composePage(theme);
      const chrome = { headerHtml: null, footerHtml: chromeFooter };
      let html = page;
      for (let i = 0; i < 3; i++) html = injectChromeIntoHtml(html, chrome);
      expect(footerNodes(html)).toHaveLength(1);
    });

    it("тело страницы не пострадало", () => {
      if (!sectionsBuilt(theme)) return;
      const { page, chromeHeader, chromeFooter } = composePage(theme);
      const out = injectChromeIntoHtml(page, {
        headerHtml: chromeHeader,
        footerHtml: chromeFooter,
      });
      // Подмена шапки не смеет съесть соседей: секция страницы на месте.
      expect(out).toContain('data-block="login-section"');
      expect(out).toContain("тело");
      expect(out).toContain("<title>шелл</title>");
    });

    it("verbatim-страница (шапка темы без puck-id) всё ещё получает хром", () => {
      if (!sectionsBuilt(theme)) return;
      const { chromeHeader } = composePage(theme);
      // Страница, собранная Astro: дефолтный <header data-nt> темы, у него
      // НЕТ корневого div с data-puck-component-id. Это и есть путь /verify,
      // /register, /legal/* — там подмена внутреннего <header> единственно
      // возможная, и её ломать нельзя.
      const verbatim =
        `<!doctype html><html><body>` +
        `<header data-nt="${theme}-header">дефолт темы</header>` +
        `<main>тело</main><footer>подвал</footer></body></html>`;
      const out = injectChromeIntoHtml(verbatim, {
        headerHtml: chromeHeader,
        footerHtml: null,
      });
      expect(headerNodes(out)).toHaveLength(1);
      expect(out).toContain('data-puck-component-id="Header-1"');
      expect(out).not.toContain("дефолт темы");
    });

    it("без хрома (headerHtml=null) страница не трогается", () => {
      if (!sectionsBuilt(theme)) return;
      const { page } = composePage(theme);
      expect(injectChromeIntoHtml(page, { headerHtml: null, footerHtml: null })).toBe(page);
    });
  });
});
