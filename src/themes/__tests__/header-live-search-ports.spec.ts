import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  escapeHtml,
  formatPrice,
  highlightMatch,
  type HeaderSearchHit,
  type HeaderSearchRenderContext,
} from "../../../packages/theme-base/runtime/header-search";
import { renderSearchResults as bloomView } from "../../../themes/bloom/src/lib/header-search-view";
import { renderSearchResults as fluxView } from "../../../themes/flux/src/lib/header-search-view";
import { renderSearchResults as roseView } from "../../../themes/rose/src/lib/header-search-view";
import { renderSearchResults as satinView } from "../../../themes/satin/src/lib/header-search-view";
import { renderSearchResults as vanillaView } from "../../../themes/vanilla/src/lib/header-search-view";

/**
 * Живой поиск из лупы в шапке — просьба владельца 22.09: «поиск по лупе, не в
 * каталоге… обычный query like… по флоу, как корзина и избранное, и потом на
 * пяти темах». Бэкенд уже был: product-service `product.findAll` ищет ILIKE,
 * gateway отдаёт `GET /api/store/products/search`. Не было витрины: лупа
 * открывала форму, которая просто уводила в каталог, а у satin подсказки
 * строились из демо-товаров, зашитых в сборку темы.
 *
 * Поведение — один модуль на пять тем (packages/theme-base/runtime/
 * header-search.ts, его сторожит header-live-search-runtime.spec.ts). Здесь —
 * то, что каждая тема обязана сделать сама, чтобы модулю было за что взяться.
 * Урок волны 12.09 («фича на одном пути из трёх»): пять портов — пять мест,
 * где подключение может молча отвалиться в одном.
 *
 * Гард смотрит ИСХОДНИК шапки (браузерные гарды CI не гоняет) и настоящие
 * функции разметки тем.
 */

const ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "flux", "vanilla", "satin", "bloom"] as const;
const MARK_OPEN =
  '<mark data-search-mark style="background:none;color:inherit;font-weight:700">';
const MARK_CLOSE = "</mark>";

const headerSource = (theme: string) =>
  readFileSync(
    resolve(ROOT, "themes", theme, "src", "components", "Header.astro"),
    "utf8",
  );

/** Комментарии не разметка: фраза из пояснения не должна засчитываться. */
const markup = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/<!--[\s\S]*?-->/g, "");

/** Выпадающая панель поиска: от `data-search-panel` до конца `<header>`. */
function panelSlice(src: string): string {
  const code = markup(src);
  const at = code.indexOf("data-search-panel");
  const end = code.indexOf("</header>", at);
  return at >= 0 && end > at ? code.slice(at, end) : "";
}

/** Открывающий тег шторки бургера `<div id="<тема>-burger" …>`. */
function burgerOpenTag(src: string, theme: string): string {
  const code = markup(src);
  const at = code.indexOf(`id="${theme}-burger"`);
  if (at < 0) return "";
  const start = code.lastIndexOf("<div", at);
  const end = code.indexOf("\t>", at);
  return code.slice(start, end);
}

describe("живой поиск шапки — контракт порта темы", () => {
  it.each(THEMES)(
    "%s: скрипт шапки подключает общий модуль с разметкой темы",
    (theme) => {
      const src = headerSource(theme);
      expect(src).toMatch(
        /import \{[^}]*\binitHeaderSearch\b[^}]*\} from "\.\.\/\.\.\/\.\.\/\.\.\/packages\/theme-base\/runtime\/header-search";/,
      );
      expect(src).toContain('from "../lib/header-search-view"');
      expect(src).toMatch(
        /initHeaderSearch\(\{ render: renderSearchResults, messageClass: SEARCH_MESSAGE_CLASS \}\)/,
      );
    },
  );

  it.each(THEMES)(
    "%s: панель — область поиска, выдача лежит ВНЕ формы (Схема 1 остаётся только полю и кнопке)",
    (theme) => {
      const panel = panelSlice(headerSource(theme));
      expect(panel).not.toBe("");
      expect(panel).toContain("data-header-search");
      expect(panel).toContain('data-search-layout="panel"');
      expect(panel).toMatch(/data-search-limit="\d+"/);
      const formEnd = panel.indexOf("</form>");
      const results = panel.indexOf("data-search-results");
      expect(formEnd).toBeGreaterThan(-1);
      // Выдача после закрытия формы: внутри form[role="search"] она унаследовала
      // бы Схему 1 (правило tokens-css), а владелец прибивал к ней поле и
      // кнопку, не панель (search-always-scheme-1.spec.ts).
      expect(results).toBeGreaterThan(formEnd);
    },
  );

  it.each(THEMES)(
    "%s: шторка бургера — область поиска, выдача и меню, которое прячется",
    (theme) => {
      const src = headerSource(theme);
      const tag = burgerOpenTag(src, theme);
      expect(tag).toContain("data-header-search");
      expect(tag).toContain('data-search-layout="drawer"');
      const code = markup(src);
      const burgerAt = code.indexOf(`id="${theme}-burger"`);
      const drawer = code.slice(burgerAt);
      expect(drawer).toContain("data-search-results");
      // Пока на экране выдача, меню шторки прячется — модуль ищет его по data-search-idle.
      expect(drawer).toMatch(/data-nav-drawer data-search-idle/);
    },
  );

  it.each(THEMES)(
    "%s: магазин приходит патчем публикации, как у подвала и корзины",
    (theme) => {
      const src = headerSource(theme);
      // patchShopIdInDist (build.service) меняет ровно эту строку на siteId.
      expect(src).toContain('const shopId = "";');
      expect(src).toMatch(/<script is:inline define:vars=\{\{ shopId \}\}>/);
    },
  );

  it.each(["vanilla", "satin", "bloom"])(
    "%s: лупа мобильной строки открывает поиск в шторке, а не десктопную панель",
    (theme) => {
      const src = headerSource(theme);
      expect(src).toContain("const openDrawerSearch = (): boolean =>");
      expect(src).toMatch(
        /if \(openDrawerSearch\(\)\) return;\s*\n\s*(const willOpen|setSearchOpen)/,
      );
    },
  );

  it("satin: подсказок из демо-товаров сборки больше нет", () => {
    const src = headerSource("satin");
    expect(src).not.toContain("data-search-index");
    expect(src).not.toMatch(/from\s+["'][^"']*data\/products["']/);
    const gsapIndex = readFileSync(
      resolve(ROOT, "themes", "satin", "src", "scripts", "gsap", "index.ts"),
      "utf8",
    );
    expect(gsapIndex).not.toMatch(/from\s+["']\.\/search["']/);
    expect(gsapIndex).not.toContain("initSearch()");
  });
});

describe("разметка выдачи темы", () => {
  const VIEWS = {
    rose: roseView,
    flux: fluxView,
    vanilla: vanillaView,
    satin: satinView,
    bloom: bloomView,
  };

  const hit = (over: Partial<HeaderSearchHit> = {}): HeaderSearchHit => ({
    id: "p-1",
    title: "Сумка «Кросс-боди»",
    href: "/product?id=p-1",
    image: "https://minio.merfy.ru/a.jpg",
    images: ["https://minio.merfy.ru/a.jpg", "https://minio.merfy.ru/b.jpg"],
    price: 3990,
    oldPrice: 5990,
    onSale: true,
    available: true,
    combinationId: null,
    combinationOptions: null,
    ...over,
  });

  const ctx = (layout: string, query = "сумка"): HeaderSearchRenderContext => ({
    layout,
    query,
    total: 1,
    formatPrice,
    escapeHtml,
    highlight: (text: string) => highlightMatch(text, query),
  });

  const CASES = THEMES.flatMap((t) =>
    (["panel", "drawer"] as const).map((l) => [t, l] as const),
  );

  it.each(CASES)(
    "%s/%s: у карточки id товара для превью конструктора и ссылка на страницу товара",
    (theme, layout) => {
      const html = VIEWS[theme]([hit()], ctx(layout));
      // preview-nav-agent берёт productId из ближайшего [data-product-id] —
      // без него клик в превью открыл бы товар «по умолчанию», а не найденный.
      expect(html).toMatch(/<li data-search-hit data-product-id="p-1"/);
      expect(html).toContain('href="/product?id=p-1"');
      expect(html).toContain(formatPrice(3990));
    },
  );

  it.each(CASES)(
    "%s/%s: название товара экранируется — оно приходит от мерчанта",
    (theme, layout) => {
      const html = VIEWS[theme](
        [hit({ title: '<img src=x onerror="alert(1)">' })],
        ctx(layout),
      );
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    },
  );

  it.each(CASES)(
    "%s/%s: старая цена — только у уценённого товара",
    (theme, layout) => {
      const sale = VIEWS[theme]([hit()], ctx(layout));
      const plain = VIEWS[theme](
        [hit({ oldPrice: null, onSale: false })],
        ctx(layout),
      );
      expect(sale).toContain(formatPrice(5990));
      expect(sale).toMatch(/line-through/);
      expect(plain).not.toContain(formatPrice(5990));
      expect(plain).not.toMatch(/line-through/);
    },
  );

  it("bloom/шторка: «В корзину» кладёт выбранную комбинацию через общий делегат корзины", () => {
    const html = bloomView(
      [hit({ combinationId: "c-grey", combinationOptions: { Цвет: "Серый" } })],
      ctx("drawer"),
    );
    expect(html).toMatch(
      /<button type="button" data-add-to-cart data-product-id="p-1"/,
    );
    expect(html).toContain('data-variant-combination-id="c-grey"');
    expect(html).toContain("data-variant-options=");
    const soldOut = bloomView([hit({ available: false })], ctx("drawer"));
    expect(soldOut).not.toContain("data-add-to-cart");
    expect(soldOut).toContain("Нет в наличии");
  });

  it("bloom: точки-переключатель фото — только если фото больше одного", () => {
    expect(bloomView([hit()], ctx("panel"))).toContain("data-search-dot");
    expect(
      bloomView(
        [hit({ images: ["https://minio.merfy.ru/a.jpg"] })],
        ctx("panel"),
      ),
    ).not.toContain("data-search-dot");
  });

  describe("подсветка совпадения в выдаче темы", () => {
    it.each(CASES)(
      "%s/%s: название подсвечивается в текстовом узле выдачи",
      (theme, layout) => {
        const html = VIEWS[theme](
          [hit({ title: "Кроссовки Runner" })],
          ctx(layout, "кр"),
        );
        expect(html).toContain(`${MARK_OPEN}Кр${MARK_CLOSE}оссовки`);
      },
    );

    it.each(CASES)(
      "%s/%s: слово из двух букв не подсвечивается в середине слова",
      (theme, layout) => {
        const html = VIEWS[theme](
          [hit({ title: "Ботинки красный" })],
          ctx(layout, "ра"),
        );
        expect(html).not.toContain("<mark");
      },
    );

    it.each(THEMES)(
      "%s: запрос, совпадающий с частью вредоносного названия, всё равно экранируется",
      (theme) => {
        const html = VIEWS[theme](
          [hit({ title: '<img src=x onerror="alert(1)">' })],
          ctx("panel", "img"),
        );
        // Тег не должен пройти как есть — «img» ушло в <mark>, но «<» и «>» экранированы.
        expect(html).not.toContain("<img src=x");
        expect(html).toContain("&lt;");
        expect(html).toContain(`${MARK_OPEN}img${MARK_CLOSE}`);
      },
    );

    it("bloom: data-name кнопки «В корзину» — обычное экранирование, без подсветки", () => {
      const html = bloomView(
        [hit({ title: "Кроссовки Runner", available: true })],
        ctx("drawer", "кр"),
      );
      expect(html).toContain('data-name="Кроссовки Runner"');
      expect(html).not.toMatch(/data-name="[^"]*<mark/);
      // Название в тексте карточки при этом подсвечено — атрибут остался плоским не из-за отсутствия совпадения.
      expect(html).toContain(`${MARK_OPEN}Кр${MARK_CLOSE}оссовки`);
    });
  });
});
