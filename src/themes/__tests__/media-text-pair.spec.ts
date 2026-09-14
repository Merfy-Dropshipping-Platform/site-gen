/**
 * Пара «медиа + текст»: зазор, доли колонок, живая «Ширина».
 *
 * Жалоба владельца 2026-09-15 (дословно): «контейнер и медиа соприкасаются;
 * если медиа маленького размера, контейнер берёт на себя больше места, и так же
 * наоборот». Секция — семья «медиа + текст»: «Изображение с текстом»
 * (ImageWithText) и «Мультиряды» (MultiRows, чередование сторон по индексу).
 *
 * ЗАМЕР «ДО» (Chromium, окна 1920/1440/375, пять тем × два блока × три «Ширины»
 * × обе стороны чередования = 60 клеток на окно; рендер — скомпилированным
 * модулем темы, CSS — тот же, что в превью):
 *
 *   блок              тема     медиа/текст/зазор при «Ширина»=small → large
 *   ImageWithText     rose     370/370/40 → 640/640/40
 *   ImageWithText     vanilla  388/352/40 → 652/352/40   ← доли ПЛЫВУТ
 *   ImageWithText     bloom    382/382/16 → 652/652/16
 *   ImageWithText     satin    390/390/ 0 → 660/660/ 0   ← зазора НЕТ
 *   ImageWithText     flux     370/370/40 → 620/620/40
 *   MultiRows         rose     370/370/40 → 640/640/40
 *   MultiRows         vanilla  640/640/40 → 640/640/40   ← «Ширина» МЕРТВА
 *   MultiRows         bloom    382/382/16 → 652/652/16
 *   MultiRows         satin    370/370/40 → 640/640/40
 *   MultiRows         flux     374/374/32 → 624/624/32
 *
 * Отсюда три требования, каждое — от числа, а не от вкуса:
 *   1) зазор пары НЕ нулевой (девять клеток из десяти его имеют; ноль только у
 *      satin/ImageWithText — это и есть «соприкасаются»);
 *   2) колонки пары не заморожены РАЗНЫМИ пиксельными потолками: иначе «Ширина»
 *      не масштабирует пару, а перекладывает место между медиа и контейнером
 *      (vanilla/ImageWithText: текст стоял в max-w-[352px], медиа была lg:flex-1
 *      и одна отдавала весь остаток — 388/352 против 652/352);
 *   3) «Ширина» жива: потолок контейнера при small ≠ потолок при large
 *      (vanilla/MultiRows давала 1320px на всех трёх значениях, потому что
 *      нелокализованный `.vanilla-container` перебивал утилиту max-w-*).
 *
 * Плюс четвёртое, инфраструктурное: каждый класс, который порт реально пишет в
 * разметку, обязан существовать в СОБСТВЕННОМ бандле темы. На живой витрине
 * другого CSS нет; а в превью недостающий класс подменяется соседним из
 * preview-tailwind.css, и конструктор показывает не то, что увидит покупатель
 * (так vanilla/«Мультиряды» показывали зазор 16px вместо живых 40px).
 *
 * ЧТО СТОРОЖИМ. Не наличие строки в исходнике, а ПОБЕДИТЕЛЯ КАСКАДА в реальных
 * собранных бандлах для реальных узлов реального рендера. Проверка «есть класс»
 * слепа: и утилиты Tailwind, и классы темы лежат рядом, и решают слой/порядок.
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 *   && pnpm build:preview-tailwind
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "vanilla", "bloom", "satin", "flux"] as const;
type Theme = (typeof THEMES)[number];
const BLOCKS = ["ImageWithText", "MultiRows"] as const;
type Block = (typeof BLOCKS)[number];
/** Десктопная опора замера: ширина окна, на которой сняты числа «до». */
const DESKTOP_PX = 1440;

// ─────────────────────────────── рендер ───────────────────────────────

const propsFor = (block: Block, width: "small" | "medium" | "large") =>
  block === "MultiRows"
    ? {
        id: "MultiRows-guard",
        colorScheme: "1",
        padding: { top: 40, bottom: 40 },
        width,
        size: "small",
        rowsPosition: "left",
        heading: "Мультиряды",
        alignment: "left",
        rows: [
          {
            id: "row-1",
            title: "Ряд 1",
            description: "Текст ряда",
            image: "",
            size: "small",
            headingSize: "small",
            textSize: "small",
            button: { text: "Кнопка", link: "/catalog" },
          },
        ],
      }
    : {
        id: "ImageWithText-guard",
        colorScheme: "1",
        padding: { top: 40, bottom: 40 },
        width,
        size: "medium",
        imagePosition: "left",
        image: { url: "", alt: "" },
        heading: "Изображение с текстом",
        text: "Покажи и расскажи о своем товаре в одном блоке",
        button: { text: "Кнопка", href: "/about" },
        alignment: "left",
      };

const htmlCache = new Map<string, string>();

function renderPair(theme: Theme, block: Block, width: "small" | "medium" | "large"): string {
  const key = `${theme}/${block}/${width}`;
  const ready = htmlCache.get(key);
  if (ready !== undefined) return ready;
  const jobs = [{ block, cascade: true, live: true, props: propsFor(block, width) }];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(
      `рендер ${block} (${theme}, ширина ${width}) не дал HTML: ${JSON.stringify(row).slice(0, 300)}`,
    );
  }
  htmlCache.set(key, row.html);
  return row.html;
}

// ─────────────────────── поиск пары в разметке ───────────────────────

const elementChildren = (el: HTMLElement): HTMLElement[] =>
  el.childNodes.filter(
    (n): n is HTMLElement => (n as HTMLElement).tagName !== undefined,
  );

const looksLikeMedia = (el: HTMLElement): boolean =>
  /aspect-/.test(el.getAttribute("class") ?? "") ||
  el.querySelector("img") !== null ||
  el.tagName === "IMG";

/**
 * Пара = САМЫЙ ВНЕШНИЙ узел с ровно двумя элементами-детьми, один из которых
 * несёт медиа. У «Мультирядов» приоритет у явной разметки ряда: её кладёт
 * конструктор, и на неё же смотрит превью.
 */
function findPair(root: HTMLElement): HTMLElement {
  const rows = root.querySelectorAll('[data-puck-subsection-field="rows"]');
  if (rows.length) return rows[0];
  const queue: HTMLElement[] = [root];
  while (queue.length) {
    const el = queue.shift() as HTMLElement;
    const kids = elementChildren(el);
    if (kids.length === 2 && kids.some(looksLikeMedia)) return el;
    queue.push(...kids);
  }
  throw new Error("пара «медиа + текст» в разметке не найдена");
}

function pairParts(theme: Theme, block: Block, width: "small" | "medium" | "large") {
  const section = parse(renderPair(theme, block, width));
  const root =
    section.querySelector("[data-puck-component-id]") ??
    (section.firstChild as HTMLElement);
  const pair = findPair(root);
  const kids = elementChildren(pair);
  const media = kids.find(looksLikeMedia) ?? kids[0];
  const text = kids.find((k) => k !== media) as HTMLElement;
  // Предки пары — на них висит потолок ширины («Ширина» секции).
  const ancestors: HTMLElement[] = [];
  let node: HTMLElement | null = pair;
  while (node && node !== root) {
    ancestors.push(node);
    node = node.parentNode as HTMLElement | null;
  }
  if (node === root) ancestors.push(root);
  return { root, pair, media, text, ancestors };
}

const classesOf = (el: HTMLElement): string[] =>
  (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

// ───────────────────────── мини-каскад по бандлам ─────────────────────────

type Rule = {
  selector: string;
  decls: Record<string, string>;
  layer: string | null;
  minWidth: number;
  specificity: number;
  order: number;
};

function stripComments(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    if (css[i] === "/" && css[i + 1] === "*") {
      const e = css.indexOf("*/", i + 2);
      i = e < 0 ? css.length : e + 2;
      continue;
    }
    if (css[i] === '"' || css[i] === "'") {
      const q = css[i];
      let j = i + 1;
      while (j < css.length && css[j] !== q) j += css[j] === "\\" ? 2 : 1;
      out += css.slice(i, Math.min(j + 1, css.length));
      i = j + 1;
      continue;
    }
    out += css[i];
    i++;
  }
  return out;
}

/** min-width из условия @media в обеих формах Tailwind v4: `min-width:48rem` и `width >= 48rem`. */
function minWidthOf(prelude: string): number {
  const m =
    /min-width\s*:\s*([\d.]+)(px|rem)/.exec(prelude) ??
    /width\s*>=\s*([\d.]+)(px|rem)/.exec(prelude);
  if (!m) return 0;
  return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
}

const specificityOf = (selector: string): number =>
  (selector.match(/\\?\./g) ?? []).length +
  (selector.match(/\[/g) ?? []).length * 1 +
  (selector.match(/#/g) ?? []).length * 100;

type Bundle = { rules: Rule[]; vars: Record<string, string>; layerOrder: string[] };

/** Разбор бандла в плоский список правил со слоем, @media и порядком. */
function parseBundle(cssRaw: string, startOrder: number): Bundle {
  const css = stripComments(cssRaw);
  const rules: Rule[] = [];
  const vars: Record<string, string> = {};
  const layerOrder: string[] = [];
  let order = startOrder;

  const declsOf = (body: string): Record<string, string> => {
    const decls: Record<string, string> = {};
    let depth = 0;
    let buf = "";
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      if (ch === ";" && depth === 0) {
        const c = buf.indexOf(":");
        if (c > 0) decls[buf.slice(0, c).trim()] = buf.slice(c + 1).trim();
        buf = "";
        continue;
      }
      if (depth === 0) buf += ch;
    }
    const c = buf.indexOf(":");
    if (c > 0 && !/[{}]/.test(buf)) decls[buf.slice(0, c).trim()] = buf.slice(c + 1).trim();
    return decls;
  };

  const walk = (text: string, layer: string | null, minWidth: number) => {
    let i = 0;
    while (i < text.length) {
      const semi = text.indexOf(";", i);
      const open = text.indexOf("{", i);
      if (open < 0) {
        // хвост без блока: объявление порядка слоёв `@layer a, b, c;`
        const tail = text.slice(i).trim();
        if (/^@layer\s+[^;{]+;/.test(tail)) {
          for (const n of tail.replace(/^@layer\s+/, "").replace(/;.*$/s, "").split(","))
            if (n.trim() && !layerOrder.includes(n.trim())) layerOrder.push(n.trim());
        }
        break;
      }
      if (semi >= 0 && semi < open) {
        const stmt = text.slice(i, semi + 1).trim();
        if (/^@layer\s/.test(stmt)) {
          for (const n of stmt.replace(/^@layer\s+/, "").replace(/;$/, "").split(","))
            if (n.trim() && !layerOrder.includes(n.trim())) layerOrder.push(n.trim());
        }
        i = semi + 1;
        continue;
      }
      const prelude = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      i = j;

      if (/^@layer\b/.test(prelude)) {
        const name = prelude.replace(/^@layer\s*/, "").trim() || layer || "";
        if (name && !layerOrder.includes(name)) layerOrder.push(name);
        walk(body, name || layer, minWidth);
        continue;
      }
      if (/^@media\b/.test(prelude)) {
        walk(body, layer, Math.max(minWidth, minWidthOf(prelude)));
        continue;
      }
      if (/^@(supports|scope|container)\b/.test(prelude)) {
        walk(body, layer, minWidth);
        continue;
      }
      if (/^@(keyframes|font-face|property|charset|import|page|counter-style)\b/.test(prelude)) {
        continue;
      }
      if (/^@theme\b/.test(prelude)) {
        for (const [k, v] of Object.entries(declsOf(body))) if (k.startsWith("--")) vars[k] = v;
        continue;
      }
      // Обычное правило. В неминифицированном выводе v4 @media лежит ВНУТРИ него.
      const own = declsOf(body);
      for (const [k, v] of Object.entries(own)) if (k.startsWith("--")) vars[k] = v;
      for (const sel of prelude.split(",")) {
        const s = sel.trim();
        if (!s) continue;
        rules.push({
          selector: s,
          decls: own,
          layer,
          minWidth,
          specificity: specificityOf(s),
          order: order++,
        });
      }
      // вложенные at-правила: те же селекторы, но своё условие
      const nested = /@(media|supports)[^{]*\{/g;
      let m: RegExpExecArray | null;
      while ((m = nested.exec(body))) {
        const nOpen = m.index + m[0].length - 1;
        let d = 1;
        let k = nOpen + 1;
        while (k < body.length && d > 0) {
          if (body[k] === "{") d++;
          else if (body[k] === "}") d--;
          k++;
        }
        const inner = body.slice(nOpen + 1, k - 1);
        const innerMin = Math.max(minWidth, minWidthOf(m[0]));
        const innerDecls = declsOf(inner);
        for (const sel of prelude.split(",")) {
          const s = sel.trim();
          if (!s) continue;
          rules.push({
            selector: s,
            decls: innerDecls,
            layer,
            minWidth: innerMin,
            specificity: specificityOf(s),
            order: order++,
          });
        }
        nested.lastIndex = k;
      }
    }
  };

  walk(css, null, 0);
  return { rules, vars, layerOrder };
}

const bundleCache = new Map<string, Bundle>();

function bundle(theme: Theme, withPreview: boolean): Bundle {
  const key = `${theme}/${withPreview}`;
  const ready = bundleCache.get(key);
  if (ready) return ready;
  const themeCss = resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`);
  const previewCss = resolve(SITES_ROOT, "dist", "preview-tailwind.css");
  if (!existsSync(themeCss)) throw new Error(`нет ${themeCss} — нужен pnpm build:theme-sections:all`);
  const parts: Bundle[] = [];
  let order = 0;
  if (withPreview) {
    if (!existsSync(previewCss)) throw new Error(`нет ${previewCss} — нужен pnpm build:preview-tailwind`);
    const p = parseBundle(readFileSync(previewCss, "utf-8"), order);
    order += p.rules.length + 1;
    parts.push(p);
  }
  parts.push(parseBundle(readFileSync(themeCss, "utf-8"), order + 1_000_000));
  const merged: Bundle = {
    rules: parts.flatMap((p) => p.rules),
    vars: Object.assign({}, ...parts.map((p) => p.vars)),
    layerOrder: [...new Set(parts.flatMap((p) => p.layerOrder))],
  };
  bundleCache.set(key, merged);
  return merged;
}

/** Победитель каскада для свойства на узле с данными классами при ширине окна. */
function winner(
  b: Bundle,
  classes: string[],
  props: string[],
  viewportPx: number,
): { value: string; selector: string } | null {
  const want = new Set(classes);
  const matches = b.rules.filter((r) => {
    if (r.minWidth > viewportPx) return false;
    if (!props.some((p) => r.decls[p] !== undefined)) return false;
    // селектор вида `.a`, `.a.b`, `.a:hover` — все классы должны быть на узле
    if (!/^\.[^\s>+~,]*$/.test(r.selector)) return false;
    if (/:(hover|focus|active|focus-visible|focus-within|disabled|checked)/.test(r.selector)) return false;
    const names = (r.selector.match(/\.((?:\\.|[^.\s:[])+)/g) ?? []).map((c) =>
      c.slice(1).replace(/\\/g, ""),
    );
    return names.length > 0 && names.every((n) => want.has(n));
  });
  if (!matches.length) return null;
  const rank = (r: Rule) => [
    r.layer === null ? 1 : 0,
    r.layer === null ? 0 : Math.max(0, b.layerOrder.indexOf(r.layer)),
    r.specificity,
    r.minWidth,
    r.order,
  ];
  let best = matches[0];
  for (const r of matches.slice(1)) {
    const a = rank(r);
    const c = rank(best);
    for (let i = 0; i < a.length; i++) {
      if (a[i] === c[i]) continue;
      if (a[i] > c[i]) best = r;
      break;
    }
  }
  const prop = props.find((p) => best.decls[p] !== undefined) as string;
  return { value: best.decls[prop], selector: best.selector };
}

/** Значение CSS в пикселях. null — «нет предела» (none/normal/auto). */
function toPx(b: Bundle, raw: string | null): number | null {
  if (raw === null) return null;
  let v = raw.trim();
  for (let i = 0; i < 6 && /var\(/.test(v); i++) {
    v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_all, name, fb) =>
      b.vars[name] !== undefined ? b.vars[name] : (fb ?? "0"),
    );
  }
  if (/^(none|normal|auto)$/.test(v)) return null;
  const calc = /^calc\(\s*([\d.]+)(rem|px)?\s*\*\s*([\d.]+)\s*\)$/.exec(v);
  if (calc) {
    const unit = calc[2] === "rem" || calc[2] === undefined ? 16 : 1;
    return Number(calc[1]) * unit * Number(calc[3]);
  }
  const num = /^([\d.]+)(px|rem)?$/.exec(v);
  if (num) return Number(num[1]) * (num[2] === "rem" ? 16 : 1);
  return null;
}

const gapPx = (theme: Theme, classes: string[], withPreview = true): number | null =>
  toPx(bundle(theme, withPreview), winner(bundle(theme, withPreview), classes, ["column-gap", "gap"], DESKTOP_PX)?.value ?? null);

const maxWidthPx = (theme: Theme, classes: string[]): number | null =>
  toPx(bundle(theme, true), winner(bundle(theme, true), classes, ["max-width"], DESKTOP_PX)?.value ?? null);

// ───────────────────────────── проверки ─────────────────────────────

describe("пара «медиа + текст»: зазор, доли колонок, живая «Ширина»", () => {
  describe("1) зазор пары не нулевой", () => {
    for (const theme of THEMES) {
      for (const block of BLOCKS) {
        it(`${theme} / ${block}: колонки не соприкасаются на ${DESKTOP_PX}px`, () => {
          const { pair } = pairParts(theme, block, "large");
          const gap = gapPx(theme, classesOf(pair));
          expect({ theme, block, gap }).toEqual({ theme, block, gap: expect.any(Number) });
          expect(gap as number).toBeGreaterThan(0);
        });
      }
    }
  });

  describe("2) колонки пары не заморожены разными потолками", () => {
    for (const theme of THEMES) {
      for (const block of BLOCKS) {
        it(`${theme} / ${block}: «Ширина» масштабирует пару, а не перекладывает место`, () => {
          const { media, text } = pairParts(theme, block, "large");
          const mediaCap = maxWidthPx(theme, classesOf(media));
          const textCap = maxWidthPx(theme, classesOf(text));
          // Разные пиксельные потолки допустимы только если обе колонки ещё и
          // ужимаются пропорционально (flex-basis той же пары чисел).
          if (mediaCap !== textCap) {
            const basis = (el: typeof media) =>
              toPx(bundle(theme, true), winner(bundle(theme, true), classesOf(el), ["flex-basis", "flex"], DESKTOP_PX)?.value ?? null);
            expect({
              theme,
              block,
              mediaCap,
              textCap,
              mediaBasis: basis(media),
              textBasis: basis(text),
            }).toEqual({
              theme,
              block,
              mediaCap,
              textCap,
              mediaBasis: mediaCap,
              textBasis: textCap,
            });
          } else {
            expect(mediaCap).toBe(textCap);
          }
        });
      }
    }
  });

  describe("3) «Ширина» жива", () => {
    for (const theme of THEMES) {
      for (const block of BLOCKS) {
        it(`${theme} / ${block}: small и large дают разный потолок контейнера`, () => {
          const capOf = (w: "small" | "large") => {
            const { ancestors } = pairParts(theme, block, w);
            const caps = ancestors
              .map((el) => maxWidthPx(theme, classesOf(el)))
              .filter((v): v is number => v !== null);
            return caps.length ? Math.min(...caps) : null;
          };
          const small = capOf("small");
          const large = capOf("large");
          expect({ theme, block, small, large }).toEqual({
            theme,
            block,
            small: expect.any(Number),
            large: expect.any(Number),
          });
          expect(small).not.toBe(large);
        });
      }
    }
  });

  describe("4) бандл темы содержит классы своих портов", () => {
    for (const theme of THEMES) {
      for (const block of BLOCKS) {
        it(`${theme} / ${block}: зазор пары читается из бандла темы без preview-tailwind`, () => {
          const { pair } = pairParts(theme, block, "large");
          const withPreview = gapPx(theme, classesOf(pair), true);
          const themeOnly = gapPx(theme, classesOf(pair), false);
          expect({ theme, block, withPreview, themeOnly }).toEqual({
            theme,
            block,
            withPreview,
            themeOnly: withPreview,
          });
        });
      }
    }
  });
});
