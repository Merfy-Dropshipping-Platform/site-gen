import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { buildTokensCss } from "../tokens-css";

/**
 * Серые НАДПИСИ витрины обязаны ехать за цветовой схемой.
 *
 * Жалоба тестировщика 14.09 (дословно): «В настройках темы в пункте карточка
 * товара не полностью применяется цветовая схема к карточке… Везде серые
 * надписи остались, принимать должны на себя цвет текста. Цена до скидки в
 * товаре тоже цвет текста, и так везде». На скриншоте — список товаров на
 * голубом фоне схемы: имя и цена окрашены, а «Удалить» и подпись варианта
 * «Белый, XXL» серые.
 *
 * Половину починил токен: `--color-muted` больше не фиксированный серый, он
 * считается из схемы (60 % текста + 40 % фона) — сторож `test:muted-text`.
 * Вторая половина — жёсткие литералы `#999999`/`#cccccc`/`#444444`/`#606060`
 * прямо в разметке пяти тем: токен их не достаёт, они красили надписи серым
 * при любой схеме. Замер до правки (Playwright, схема тестировщика
 * bg #71C0FF / text #E91E8C, у неё `--color-muted` = `185 95 186`): 174 узла
 * из 174 отдавали computed-цвет 153/163/204/96/102/68 — то есть НИ ОДИН не
 * слушал схему.
 *
 * Этот сторож запрещает КРАСИТЬ ТЕКСТ жёстким нейтральным серым в портах пяти
 * тем. Он смотрит только на роль «цвет текста»:
 *   • tailwind-утилита `text-[#…]` без варианта,
 *   • объявление `color: #…` / `color: rgb(…)` (инлайн-стиль или CSS-правило).
 * Рамки (`border-…`), фоны (`bg-…`), svg `fill`/`stroke`, плейсхолдеры полей,
 * состояния `hover:`/`disabled` — законные серые, они сюда не попадают.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

/** Файлы вне витрины: мёртвый компонент и локальный dev-редактор темы. */
const OUT_OF_STOREFRONT = [
  /components\/HeaderLink\.astro$/, // ни один шаблон темы его не импортирует
  /pages\/design-system\.astro$/, // служебная страница дизайн-системы
  /pages\/puck-editor\.astro$/, // локальный dev-редактор внутри темы
  /src\/puck\/config\.tsx$/, // конфиг того же dev-редактора
];

/** Точечные исключения — серый здесь несёт смысл, а не «забыли токен». */
const ALLOWED = [
  {
    file: /FluxProductCard\.astro$/,
    line: /border-\[#F5F5F5\] bg-\[#F5F5F5\]/,
    why: "состояние disabled: недоступный размер",
  },
  {
    file: /RosePdpColorVariantRow\.astro$/,
    line: /!cursor-not-allowed/,
    why: "состояние disabled: недоступный цвет варианта",
  },
  {
    file: /pages\/about\.astro$/,
    line: /text-\[#F0F0F0\]/,
    why: "светлый текст на фиксированном тёмном фоне секции — сосед text-white, а не серая надпись",
  },
];

function isNeutralGrey(hex: string): boolean {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (h.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // нейтраль (R≈G≈B) средней яркости: ни белый, ни чёрный — именно «серая надпись»
  return max - min <= 12 && max <= 240 && max >= 40;
}

function isNeutralGreyRgb(triple: number[]): boolean {
  const max = Math.max(...triple);
  const min = Math.min(...triple);
  return max - min <= 12 && max <= 240 && max >= 40;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", ".astro"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(astro|ts|tsx|css)$/.test(name)) out.push(p);
  }
  return out;
}

const isComment = (line: string) => /^\s*(\/\/|\/\*|\*|<!--)/.test(line);

/** Селектор правила, внутри которого стоит объявление на позиции `idx`. */
function enclosingSelector(src: string, idx: number): string {
  const open = src.lastIndexOf("{", idx);
  if (open < 0) return "";
  const close = src.lastIndexOf("}", idx);
  if (close > open) return ""; // объявление вне правила (инлайн-стиль)
  const prev = Math.max(
    src.lastIndexOf("}", open),
    src.lastIndexOf("{", open - 1),
  );
  return src.slice(prev + 1, open).trim();
}

type Violation = {
  theme: string;
  file: string;
  line: number;
  found: string;
  snippet: string;
};

function scanTheme(theme: string): Violation[] {
  const root = join(SITES_ROOT, "themes", theme, "src");
  const bad: Violation[] = [];
  for (const file of walk(root)) {
    if (OUT_OF_STOREFRONT.some((re) => re.test(file))) continue;
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    let offset = 0;
    lines.forEach((line, i) => {
      const lineStart = offset;
      offset += line.length + 1;
      if (isComment(line)) return;
      if (ALLOWED.some((a) => a.file.test(file) && a.line.test(line))) return;

      // 1) tailwind-утилита цвета текста без варианта (placeholder:/hover:/… пропускаем)
      for (const m of line.matchAll(
        /(^|[\s"'`{([])!?text-\[(#[0-9a-fA-F]{3,6})\]/g,
      )) {
        if (isNeutralGrey(m[2]))
          bad.push({
            theme,
            file: relative(SITES_ROOT, file),
            line: i + 1,
            found: `text-[${m[2]}]`,
            snippet: line.trim().slice(0, 120),
          });
      }
      // 2) объявление цвета текста
      for (const m of line.matchAll(
        /(^|[;{"'\s])(color)\s*:\s*(#[0-9a-fA-F]{3,6}|rgba?\((?!\s*var\(--)[^)]*\))/g,
      )) {
        const value = m[3];
        const grey = value.startsWith("#")
          ? isNeutralGrey(value)
          : (() => {
              const n = value
                .match(/\d{1,3}/g)
                ?.slice(0, 3)
                .map(Number);
              return !!n && n.length === 3 && isNeutralGreyRgb(n);
            })();
        if (!grey) continue;
        const sel = enclosingSelector(src, lineStart + (m.index ?? 0));
        if (/::placeholder|:disabled|\[disabled\]/.test(sel)) continue; // законный серый
        bad.push({
          theme,
          file: relative(SITES_ROOT, file),
          line: i + 1,
          found: `color: ${value}`,
          snippet: line.trim().slice(0, 120),
        });
      }
    });
  }
  return bad;
}

const report = (v: Violation[]) =>
  v
    .map((x) => `  ${x.file}:${x.line}  ${x.found}\n      ${x.snippet}`)
    .join("\n");

describe("серые надписи витрины следуют цветовой схеме, а не литералу", () => {
  it.each(THEMES)("%s: ни одна надпись не покрашена жёстким серым", (theme) => {
    const bad = scanTheme(theme);
    expect(
      bad.length === 0
        ? ""
        : `тема ${theme}: ${bad.length} надпис(ь/и) красятся жёстким серым вместо rgb(var(--color-muted,…)):\n${report(bad)}`,
    ).toBe("");
  });

  /**
   * Тестировщик назвал два места поимённо — они проверяются отдельно, чтобы
   * общий сторож нельзя было «починить» расширением списка исключений.
   */
  const DRAWER = {
    rose: "themes/rose/src/lib/cart.ts",
    vanilla: "themes/vanilla/src/lib/nt-cart-vanilla.ts",
    flux: "themes/flux/src/lib/cart.ts",
    satin: "themes/satin/src/lib/nt-cart-satin.ts",
    bloom: "themes/bloom/src/lib/nt-cart-bloom.ts",
  } as const;

  it.each(THEMES)("%s: «Удалить» в корзине берёт цвет из схемы", (theme) => {
    const src = readFileSync(join(SITES_ROOT, DRAWER[theme]), "utf8");
    const line = src
      .split("\n")
      .find((l) => /data-cart-remove/.test(l) && /class=/.test(l));
    expect(line).toBeDefined();
    expect(line).toContain("text-[rgb(var(--color-muted");
    expect(/(^|[\s"'`])text-\[#[0-9a-fA-F]{3,6}\]/.test(line as string)).toBe(
      false,
    );
  });

  it.each(THEMES)(
    "%s: подпись варианта в корзине берёт цвет из схемы",
    (theme) => {
      const src = readFileSync(join(SITES_ROOT, DRAWER[theme]), "utf8");
      const line = src
        .split("\n")
        .find((l) => /\$\{(escapeHtml\()?variant/.test(l) && /class=/.test(l));
      expect(line).toBeDefined();
      expect(line).toContain("text-[rgb(var(--color-muted");
      expect(/(^|[\s"'`])text-\[#[0-9a-fA-F]{3,6}\]/.test(line as string)).toBe(
        false,
      );
    },
  );

  const OLD_PRICE = {
    rose: "themes/rose/src/components/products/RoseProductCard.astro",
    vanilla: "themes/vanilla/src/components/products/VanillaProductCard.astro",
    flux: "themes/flux/src/components/products/FluxProductCard.astro",
    satin: "themes/satin/src/components/products/SatinProductCard.astro",
    bloom: "themes/bloom/src/components/products/BloomProductCard.astro",
  } as const;

  it.each(THEMES)(
    "%s: цена до скидки в карточке берёт цвет из схемы",
    (theme) => {
      const src = readFileSync(join(SITES_ROOT, OLD_PRICE[theme]), "utf8");
      const line = src
        .split("\n")
        .find((l) => /line-through/.test(l) && /class=/.test(l));
      expect(line).toBeDefined();
      expect(line).toContain("text-[rgb(var(--color-muted");
    },
  );
});

/**
 * Вторая половина того же бага — со стороны токена.
 *
 * Перевод надписей на `--color-muted` бесполезен, пока сам токен заморожен.
 * `buildTokensCss` подмешивал мерчантской схеме `muted` из манифеста темы, а он
 * у трёх тем из пяти НЕ равен прежнему серому: flux `204 204 204`, vanilla
 * `200 200 200`, bloom `245 245 245`. Значение «не 153» считалось осознанным и
 * не пересчитывалось — поэтому фикс «muted следует схеме» работал только у rose
 * и satin. Поля для muted в редакторе схемы нет, так что для мерчанта константа
 * темы так же неизменяема, как был неизменяем серый.
 *
 * Замер (Playwright, схема тестировщика bg #71C0FF / text #E91E8C): до правки
 * flux отдавал `rgb(204, 204, 204)`, vanilla `rgb(200, 200, 200)`, bloom
 * `rgb(245, 245, 245)`; после — все три `rgb(185, 95, 186)`.
 */
describe("приглушённый токен не замораживается константой темы", () => {
  const merchantScheme = {
    id: "scheme-2",
    name: "2",
    background: "#71C0FF",
    surfaceBg: "#71C0FF",
    heading: "#E91E8C",
    text: "#E91E8C",
    // muted мерчант задать не может — поля в редакторе схемы нет
    primaryButton: {
      background: "#E91E8C",
      text: "#ffffff",
      border: "#E91E8C",
    },
    secondaryButton: {
      background: "#71C0FF",
      text: "#E91E8C",
      border: "#E91E8C",
    },
  };

  const mutedOf = (css: string, n: number) => {
    const rule = new RegExp(`\\.color-scheme-${n}\\s*\\{([^}]*)\\}`).exec(css);
    return (
      /--color-muted:\s*([^;]+)/.exec(rule?.[1] ?? "")?.[1]?.trim() ?? null
    );
  };

  const FROZEN_BY_THEME: Record<string, string> = {
    rose: "153 153 153",
    satin: "153 153 153",
    flux: "204 204 204",
    vanilla: "200 200 200",
    bloom: "245 245 245",
  };

  it.each(THEMES)(
    "%s: муted схемы мерчанта считается из его текста и фона",
    (theme) => {
      const css = buildTokensCss({ colorSchemes: [merchantScheme] }, theme);
      const muted = mutedOf(css, 2);
      expect(muted).not.toBe(FROZEN_BY_THEME[theme]);
      // 60 % текста #E91E8C (233 30 140) + 40 % фона #71C0FF (113 192 255)
      expect(muted).toBe("185 95 186");
    },
  );

  it("осознанно заданный мерчантом приглушённый уважается (тёмный сайдбар корзины)", () => {
    const css = buildTokensCss(
      { colorSchemes: [{ ...merchantScheme, muted: "#bbbbbb" }] },
      "flux",
    );
    expect(mutedOf(css, 2)).toBe("187 187 187");
  });

  it("схемы самой темы (мерчант не заводил своих) остаются как нарисованы", () => {
    const css = buildTokensCss({}, "flux");
    expect(mutedOf(css, 1)).toBe("204 204 204");
  });
});
