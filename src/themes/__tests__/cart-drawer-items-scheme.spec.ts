import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Слепое пятно всех наших сторожей корзины: `cart-page-scheme.spec.ts`
 * проверяет ТОЛЬКО статическую секцию страницы (CartBody/CartSummary.astro).
 * `cart-drawer-scheme.spec.ts` (соседний файл) проверяет ХРОМ дровера (панель/
 * заголовок/пусто/итого) через настройку «Корзина → Цветовая схема». СТРОКИ
 * ТОВАРОВ дровера (мини-корзина, видна на КАЖДОЙ странице сайта) и строки
 * легаси-монолита (CartSection.astro, живёт как алиас для немигрированных
 * ревизий) рисует ТРЕТИЙ, никем не сторожимый код — шаблонные строки внутри
 * `themes/<t>/src/lib/cart.ts` (`renderDrawerItem`) и `<script>` внутри
 * `CartSection.astro`. Правка CartBody.astro на них не влияла: тестер 15.09
 * заново поймал «Корзина — не применяется цветовая схема» уже ПОСЛЕ починки
 * страницы — потому что дровер (видимый везде, чаще страницы) остался
 * покрашен литералами.
 *
 * ЗАМЕР «до» (сканер этого файла, по всем пяти темам):
 *   rose    lib/cart.ts 8 литералов, CartSection.astro 9
 *   flux    lib/cart.ts 5,             CartSection.astro 8 (`text-black`/
 *           `bg-black`/`text-white` — ИМЕНОВАННЫЕ утилиты Tailwind 4,
 *           компилируются в var(--color-black)/var(--color-white): переменная
 *           ЕСТЬ, схемы в ней нет — тот же класс дефекта, что бракет-hex)
 *   bloom   lib/cart.ts 8 (свои акцентные #E38E9F/#FFD4E5), CartSection.astro 6
 *   satin   lib/cart.ts 4,             CartSection.astro 6
 *   vanilla lib/cart.ts 8 (drawer НЕ покрыт ремапом --vanilla-*, в отличие от
 *           страницы — см. global.css: ремап только на
 *           `[data-block="cart-body"]`, дровер красит ЭТОТ файл напрямую),
 *           CartSection.astro 0 (страница vanilla уже писала --vanilla-*)
 *
 * ЛОВУШКА (поймана дважды за 15.09 на СОСЕДНИХ гардах — не повторять):
 * регулярка по сырому исходнику путает комментарий с кодом (README
 * `scripts/qa/lib`, п. «Экранирование…», плюс живой инцидент дня: один сторож
 * видел половину правил, другой краснел на фразе в пояснении). Однострочные и
 * блочные JS-комментарии ВЫРЕЗАНЫ до поиска классов — см. `stripComments()`.
 *
 * ВТОРАЯ ЛОВУШКА (поймана СЕГОДНЯ на этом самом файле — не повторять): имя
 * `cart-drawer-scheme.spec.ts` уже занято соседним, не связанным по коду
 * гардом (проверяет настройку «Корзина → Цветовая схема», commit 38562c56).
 * Файл этого гарда называется иначе — `cart-drawer-items-scheme.spec.ts` —
 * чтобы больше никто не затёр один готовый гард другим по совпадению имени.
 *
 * ЗАКОННЫЕ ИСКЛЮЧЕНИЯ (не трогать, см. ALLOWED):
 *   • плашка-плейсхолдер под картинкой превью (`bg-[#F5F5F5]`/`bg-[#FFxxxx]`
 *     на `size-N shrink-0 overflow-hidden`) — тот же хвост, что в
 *     cart-page-scheme.spec.ts, эталон (rose CartBody) её тоже не трогает;
 *   • rose: рамка счётчика `border-[#E5E5E5]` — общий хвост, эталон её не
 *     токенизирует (см. ALLOWED в cart-page-scheme.spec.ts);
 *   • hover-состояния (`hover:`/`group-hover:`) исключены из подсчёта ровно
 *     там, где их исключает cart-page-scheme.spec.ts — это состояние, а не
 *     постоянная краска.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

/** Вырезает однострочные и блочные JS-комментарии, СОХРАНЯЯ номера строк (переносы не трогаем). */
function stripComments(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(
    /(^|[^:])\/\/[^\n]*/g,
    (m, pre: string) => pre + " ".repeat(m.length - pre.length),
  );
  return out;
}

/** Литералы, которые остаются законными (см. блок-комментарий выше). */
const ALLOWED = [
  {
    // size-20 / size-24 / size-[207px] — квадратная плашка-плейсхолдер под
    // картинкой товара, не произвольный серый/розовый фон.
    line: /size-(?:\d+|\[[^\]]+\]) shrink-0 overflow-hidden[^"]*bg-\[#[0-9A-Fa-f]{3,8}\]/,
    why: "плейсхолдер превью товара — как в CartBody.astro",
  },
  {
    line: /border-\[#E5E5E5\]/,
    why: "рамка счётчика rose — общий хвост, эталон её не токенизирует (cart-page-scheme.spec.ts)",
  },
];

/** Строки, красящие ПОСТОЯННЫМ литералом (не hover/не фолбэк, без комментариев). */
function literalPaintLines(src: string): string[] {
  const bad: string[] = [];
  const clean = stripComments(src);
  clean.split("\n").forEach((line, i) => {
    if (ALLOWED.some((a) => a.line.test(line))) return;
    const hits = [
      /(?<!hover:)(?<!group-hover:)\btext-\[#[0-9A-Fa-f]{3,8}\]/,
      /(?<!hover:)(?<!group-hover:)\bbg-\[#[0-9A-Fa-f]{3,8}\]/,
      /(?<!hover:)(?<!group-hover:)\bborder-\[#[0-9A-Fa-f]{3,8}\]/,
      /(?<!hover:)(?<!group-hover:)\b(?:text|bg)-(?:white|black)\b/,
      /(?<!-)\bcolor:\s*#[0-9A-Fa-f]{3,8}/,
      /(?<!-)\bbackground(?:-color)?:\s*#[0-9A-Fa-f]{3,8}/,
    ];
    if (hits.some((re) => re.test(line))) bad.push(`${i + 1}: ${line.trim()}`);
  });
  return bad;
}

function drawerSource(theme: string): string {
  return readFileSync(
    resolve(SITES_ROOT, "themes", theme, "src/lib/cart.ts"),
    "utf-8",
  );
}

function legacyCartSectionSource(theme: string): string | null {
  const path = resolve(
    SITES_ROOT,
    "themes",
    theme,
    "src/components/sections/CartSection.astro",
  );
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

describe("строки товаров корзины едут за цветовой схемой (дровер + легаси-монолит)", () => {
  describe.each(THEMES)("%s", (theme) => {
    it("lib/cart.ts (дровер, renderDrawerItem) — ни одной постоянной краски литералом", () => {
      const bad = literalPaintLines(drawerSource(theme));
      expect(bad).toEqual([]);
    });

    it("CartSection.astro (легаси-алиас для немигрированных ревизий) — ни одной постоянной краски литералом", () => {
      const src = legacyCartSectionSource(theme);
      if (src === null) return; // темы без легаси-монолита (не встречалось, но не валим)
      const bad = literalPaintLines(src);
      expect(bad).toEqual([]);
    });
  });
});

describe("саботаж: гард обязан ловить возврат литерала", () => {
  it("bg-[#123456] на строке товара — красный", () => {
    const src = `
      renderDrawerItem: (line) => \`
        <li><a class="text-[16px] bg-[#123456]">\${line.name}</a></li>
      \`,
    `;
    expect(literalPaintLines(src)).not.toEqual([]);
  });

  it("литерал ТОЛЬКО в комментарии — не красный (гард не путает код с прозой)", () => {
    const src = `
      // Раньше было text-[#000000], теперь токен.
      /* bg-[#ffffff] тоже было тут когда-то */
      renderDrawerItem: (line) => \`
        <li><a class="text-[rgb(var(--color-text,0_0_0))]">\${line.name}</a></li>
      \`,
    `;
    expect(literalPaintLines(src)).toEqual([]);
  });

  it("несторожимое (размер шрифта) не красит гард — зелёный", () => {
    const src = `
      renderDrawerItem: (line) => \`
        <li><a class="text-[19px] text-[rgb(var(--color-text,0_0_0))]">\${line.name}</a></li>
      \`,
    `;
    expect(literalPaintLines(src)).toEqual([]);
  });
});
