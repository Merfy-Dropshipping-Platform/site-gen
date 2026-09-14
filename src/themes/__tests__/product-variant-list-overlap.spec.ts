/**
 * Раскрытый список вариаций обязан лежать ПОВЕРХ соседей секции «Товар».
 *
 * Баг тестировщика (2026-09-14): «Съезжает при настройке круг и квадрат».
 * На скриншоте конструктора — секция «Товар», «Стиль: Список», «Вариации: Круг»,
 * раскрыт список «Цвет», и ПОВЕРХ его пунктов нарисованы счётчик «− 1 +» и
 * кнопка «Добавить в корзину»: пункты «Светло-голубой» и «Чёрный» перекрыты.
 *
 * ЗАМЕР «ДО» (Chromium 1440×1400, страница превью собрана тем же кодом, что
 * отдаёт сервис: preview-tailwind + CSS темы + токены + инлайн-агент превью;
 * 2026-09-14). В каждой из пяти тем, в обеих формах, раскрытый список
 * геометрически накрывает счётчик и кнопку — так и задумано, это всплывающий
 * слой. Вопрос в том, КТО СВЕРХУ. `document.elementFromPoint` в десяти точках
 * внутри пересечений:
 *
 *   состояние превью      rose   vanilla   flux   satin   bloom
 *   покой                 0/10    0/10     0/10    0/10    0/10   ← список сверху
 *   секция под курсором  10/10   10/10    10/10   10/10   10/10   ← отнято
 *   секция выбрана       10/10   10/10    10/10   10/10   10/10   ← отнято
 *
 * «Отнято» = сверху оказались `[data-add-to-cart]` и счётчик. Мерчант в
 * конструкторе ВСЕГДА в состоянии «секция под курсором/выбрана» — он только что
 * кликнул в неё, чтобы менять «Вариации». Поэтому баг видно всегда, а на живой
 * витрине (там подсветки нет) списка ничто не перекрывает.
 *
 * ПРИЧИНА. Подсветка подсекций в превью (`preview.service.ts`, injectStyles):
 *   [data-puck-subsection-parent]        {position:relative;cursor:pointer}
 *   [data-puck-subsection-hover="true"]  {outline:…;z-index:3}
 *   [data-puck-subsection-selected="true"]{outline:…;z-index:4}
 * `position:relative` + `z-index:3` = КОНТЕКСТ НАЛОЖЕНИЯ на КАЖДОЙ обёртке
 * параметра секции. Обёртки «Варианты», «Количество» и «Кнопки» получают
 * одинаковый z-index, при равном z-index порядок решает дерево — и «Количество»
 * с «Кнопками», стоящие ниже, рисуются ПОВЕРХ «Вариантов». `z-index:20` у
 * самого списка при этом бессилен: он заперт внутри контекста своей обёртки.
 * Поднимать его до z-[9999] бесполезно — сравнение идёт между обёртками.
 *
 * Откуда взялся z-index: он приехал вместе со слоем-заливкой
 * `[data-puck-subsection-hover]::after{…;z-index:0}` (7f13d303) и держал ЕГО.
 * Заливку сняли 2026-09-09 (4aabd7bb, «убрать свечение»), а z-index остался —
 * без своей работы, но с контекстом наложения. Двумя строками выше в том же
 * файле уже записан этот урок для подсветки СЕКЦИИ: «НЕ ставим z-index …
 * Outline это border-like rendering, в z-stack не участвует».
 *
 * ЧТО СТОРОЖИМ. Две НЕОБХОДИМЫЕ и совместно достаточные вещи (обе проверены
 * замером выше) + сама причина:
 *   1) ни один предок раскрытого списка — вплоть до корня секции — не создаёт
 *      контекста наложения и не режет содержимое (`overflow`);
 *   2) список позиционирован и имеет ПОЛОЖИТЕЛЬНЫЙ z-index: соседние обёртки
 *      параметров позиционированы (`position:relative` из той же подсветки),
 *      поэтому при `z-index:auto` список проиграл бы им по порядку в дереве;
 *   3) подсветка подсекций не назначает свойств, создающих контекст наложения.
 *
 * ПОЧЕМУ СЧИТАЕМ СВОЙСТВА, А НЕ ИЩЕМ КЛАСС. Порта два, и форму/слой они
 * доставляют разными механизмами: theme-base — утилитами Tailwind
 * (`absolute z-20`), собственный порт flux — инлайн-стилем
 * (`position:absolute;z-index:20`). Проверка «есть класс z-20» зелена на одном
 * и слепа на другом. Поэтому значения берутся так же, как их берёт браузер:
 * победитель каскада среди утилит узла в РЕАЛЬНЫХ бандлах превью
 * (`dist/preview-tailwind.css` + `dist/theme-css/<тема>.css`), поверх —
 * инлайн-стиль узла, поверх — правила подсветки из ЖИВОГО текста
 * `preview.service.ts`. Резолвер откалиброван по настоящему Chromium: на 10
 * парах «тема × форма» он даёт те же position/z-index, что getComputedStyle.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections <тема>
 *                 && pnpm build:preview-tailwind
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Разметку разбирает настоящий парсер, а не подстрока: цепочка предков — это
// дерево, и «предок» по индексу в строке определялся бы неверно.
import { parse } from "node-html-parser";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const STUB = resolve(__dirname, "storefront-variants-stub.mjs");
const PREVIEW_SERVICE = resolve(
  SITES_ROOT,
  "src",
  "services",
  "preview.service.ts",
);

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
const SHAPES = ["circle", "square"] as const;
type Theme = (typeof THEMES)[number];
type Shape = (typeof SHAPES)[number];

// ───────────────────────── рендер секции ─────────────────────────

/** Секция «Товар» темы полной живой цепочкой, тем же портом, что и витрина. */
function renderTheme(theme: Theme): Record<Shape, string> {
  const jobs = SHAPES.map((shape) => ({
    block: "Product",
    cascade: true,
    live: true,
    props: {
      id: `Product-${shape}`,
      productId: "p1",
      siteId: "test-site",
      colorScheme: "1",
      padding: { top: 20, bottom: 20 },
      variants: { displayStyle: "list", shape },
    },
  }));
  const raw = execFileSync(
    "node",
    [
      "--import",
      pathToFileURL(STUB).href,
      RENDERER,
      theme,
      JSON.stringify(jobs),
    ],
    { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, cwd: SITES_ROOT },
  );
  const parsed = JSON.parse(raw) as {
    html?: string;
    error?: string;
    missing?: boolean;
    pipelineError?: string;
  }[];
  const out = {} as Record<Shape, string>;
  parsed.forEach((r, i) => {
    if (!r.html) {
      throw new Error(
        `${theme} list/${SHAPES[i]}: ${r.error ?? r.pipelineError ?? (r.missing ? "порт не найден" : "нет html")}`,
      );
    }
    out[SHAPES[i]] = r.html;
  });
  return out;
}

// ──────────────────── мини-каскад по реальным бандлам ────────────────────
//
// Утилиты Tailwind — селекторы из одного класса: специфичность равна, выигрывает
// объявленная НИЖЕ. Превью грузит два бандла в порядке preview-tailwind → CSS
// темы (preview.service.renderPreviewHtml), поэтому склеиваем в том же порядке
// и берём последнее объявление. Порядок классов в атрибуте на это не влияет.

const cssSelectorOf = (cls: string) =>
  `.${cls.replace(/[.[\]()#/%,:!*+~='"^$&{}|<>?\\]/g, (ch) => `\\${ch}`)}`;
const forRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function winningDecl(
  css: string,
  classes: string[],
  prop: string,
): string | null {
  let best: { at: number; value: string } | null = null;
  for (const cls of classes) {
    const re = new RegExp(
      `${forRegExp(cssSelectorOf(cls))}\\s*\\{([^}]*)\\}`,
      "g",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const decl = new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(m[1]);
      if (!decl) continue;
      if (!best || m.index > best.at)
        best = { at: m.index, value: decl[1].trim() };
    }
  }
  return best?.value ?? null;
}

/** Объявление из инлайн-стиля узла. */
function inlineDecl(style: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(style);
  return m ? m[1].trim() : null;
}

// ──────────────── подсветка подсекций: ЖИВОЙ текст сервиса ────────────────

/**
 * Строки CSS, которые превью инжектит в <head> кадра. Берём из ИСХОДНИКА
 * сервиса, а не из своей копии: копия не краснеет, когда правило меняют.
 */
function previewOverlayRules(): { selector: string; body: string }[] {
  const src = readFileSync(PREVIEW_SERVICE, "utf-8");
  const start = src.indexOf("s.textContent = [");
  const end = src.indexOf("].join('')", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  // Комментарии выбрасываем ДО разбора: в них живут апострофы («appendChild'ом»),
  // и без этого пары кавычек разъезжаются, а список правил выходит пустым —
  // проверка стала бы зелёной, ничего не сторожа.
  const chunk = src
    .slice(start, end)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  const rules: { selector: string; body: string }[] = [];
  const re = /'((?:[^'\\]|\\.)*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk))) {
    const text = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    const brace = text.indexOf("{");
    if (brace < 0 || !text.trimEnd().endsWith("}")) continue;
    rules.push({
      selector: text.slice(0, brace).trim(),
      body: text.slice(brace + 1, text.lastIndexOf("}")),
    });
  }
  return rules;
}

/** Атрибуты, которые агент превью вешает на обёртки параметров секции. */
const SUBSECTION_STATE = [
  'data-puck-subsection-hover="true"',
  'data-puck-subsection-selected="true"',
];

/**
 * Матчит ли правило подсветки узел. Поддерживаем ровно те формы селекторов,
 * которые в этом списке есть: `[attr]`, `[attr="v"]`, `.class`,
 * `[attr]:not(.cls):not([style*="v"])`. Незнакомую форму НЕ проглатываем молча —
 * тест обязан упасть, а не считать её неприменимой.
 */
function overlayMatches(
  selector: string,
  node: { attrs: Record<string, string>; classes: string[] },
): boolean {
  if (selector.includes(",")) {
    return selector.split(",").some((s) => overlayMatches(s.trim(), node));
  }
  if (
    selector.includes("::") ||
    selector.includes(" ") ||
    selector.includes(">")
  ) {
    return false; // псевдоэлементы и потомки — не про свойства самого узла
  }
  // Псевдоклассы состояния (`:hover`, `:active`) к покоящемуся узлу не
  // применяются. `:not(...)` — не состояние, его разбираем ниже.
  if (/:(?!not\()/.test(selector.replace(/\[[^\]]*\]/g, ""))) return false;
  // Классы Tailwind экранируют спецсимволы обратным слэшем (`.h-\[var\(--x\)\]`),
  // поэтому в имени класса разрешаем ЭКРАНИРОВАННЫЙ символ, но не голую скобку:
  // иначе `.__merfy_pill[data-visible="true"]` съедается одним куском.
  const parts = selector.match(/\[[^\]]+\]|:not\([^)]+\)|\.(?:\\.|[\w-])+/g);
  if (!parts || parts.join("") !== selector) {
    throw new Error(`не разобран селектор подсветки: ${selector}`);
  }
  for (const part of parts) {
    if (part.startsWith(":not(")) {
      const inner = part.slice(5, -1);
      if (overlayMatches(inner, node)) return false;
      continue;
    }
    if (part.startsWith("[")) {
      const body = part.slice(1, -1);
      const eq = body.match(/^([\w-]+)(?:([~*^$|]?=)"?([^"\]]*)"?)?$/);
      if (!eq) throw new Error(`не разобран атрибут подсветки: ${part}`);
      const [, name, op, value] = eq;
      const actual = node.attrs[name];
      if (actual == null) return false;
      if (!op) continue;
      if (op === "=" && actual !== value) return false;
      if (op === "*=" && !actual.includes(value)) return false;
      continue;
    }
    if (part.startsWith(".")) {
      const cls = part.slice(1).replace(/\\/g, "");
      if (!node.classes.includes(cls)) return false;
      continue;
    }
  }
  return true;
}

// ──────────────────── свойства узла и контекст наложения ────────────────────

const SC_PROPS = [
  "position",
  "z-index",
  "transform",
  "filter",
  "backdrop-filter",
  "perspective",
  "opacity",
  "isolation",
  "mix-blend-mode",
  "contain",
  "will-change",
  "overflow",
] as const;

interface NodeStyle {
  tag: string;
  field: string | null;
  componentId: string | null;
  props: Record<string, string>;
}

/**
 * Итоговые значения узла так же, как их собирает браузер в кадре превью:
 * бандлы → инлайн-стиль → правила подсветки (они инжектятся ПОЗЖЕ бандлов).
 * `state` — в каком состоянии стоит секция: мерчант в конструкторе всегда
 * держит её под курсором или выбранной.
 */
function computeStyle(
  node: { tag: string; classes: string[]; attrs: Record<string, string> },
  bundles: string,
  overlay: { selector: string; body: string }[],
  state: "idle" | "hover" | "selected",
): NodeStyle {
  const attrs = { ...node.attrs };
  if (node.attrs["data-puck-subsection-parent"] != null) {
    if (state === "hover") attrs["data-puck-subsection-hover"] = "true";
    if (state === "selected") attrs["data-puck-subsection-selected"] = "true";
  }
  const props: Record<string, string> = {};
  for (const prop of SC_PROPS) {
    let value = winningDecl(bundles, node.classes, prop);
    const inline = inlineDecl(node.attrs.style ?? "", prop);
    if (inline != null) value = inline;
    for (const rule of overlay) {
      if (!overlayMatches(rule.selector, { attrs, classes: node.classes }))
        continue;
      const decl = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(
        rule.body,
      );
      if (decl) value = decl[1].trim();
    }
    if (value != null) props[prop] = value;
  }
  return {
    tag: node.tag,
    field: node.attrs["data-puck-subsection-field"] ?? null,
    componentId: node.attrs["data-puck-component-id"] ?? null,
    props,
  };
}

/** Создаёт ли узел контекст наложения (CSS 2.1 App. E + z-index/эффекты). */
function stackingContextReason(s: NodeStyle): string | null {
  const p = s.props;
  const positioned = p.position != null && p.position !== "static";
  if (positioned && p["z-index"] != null && p["z-index"] !== "auto") {
    return `${p.position} + z-index:${p["z-index"]}`;
  }
  if (p.transform && p.transform !== "none") return `transform:${p.transform}`;
  if (p.filter && p.filter !== "none") return `filter:${p.filter}`;
  if (p["backdrop-filter"] && p["backdrop-filter"] !== "none") {
    return `backdrop-filter:${p["backdrop-filter"]}`;
  }
  if (p.perspective && p.perspective !== "none")
    return `perspective:${p.perspective}`;
  if (p.opacity && Number(p.opacity) < 1) return `opacity:${p.opacity}`;
  if (p.isolation === "isolate") return "isolation:isolate";
  if (p["mix-blend-mode"] && p["mix-blend-mode"] !== "normal") {
    return `mix-blend-mode:${p["mix-blend-mode"]}`;
  }
  if (p.contain && /\b(layout|paint|strict|content)\b/.test(p.contain)) {
    return `contain:${p.contain}`;
  }
  if (
    p["will-change"] &&
    /\b(transform|opacity|filter)\b/.test(p["will-change"])
  ) {
    return `will-change:${p["will-change"]}`;
  }
  return null;
}

/** Режет ли узел содержимое (список бы обрезало по краю обёртки). */
function clipReason(s: NodeStyle): string | null {
  const ovf = s.props.overflow;
  if (ovf && ovf !== "visible" && !ovf.startsWith("clip-"))
    return `overflow:${ovf}`;
  return null;
}

// ──────────────────────────── разбор разметки ────────────────────────────

interface Parsed {
  /** Цепочка от <ul> раскрытого списка вверх до корня секции включительно. */
  chain: { tag: string; classes: string[]; attrs: Record<string, string> }[];
  /** Обёртки параметров секции — соседи по стеку. */
  siblings: { tag: string; classes: string[]; attrs: Record<string, string> }[];
}

function parseSection(html: string): Parsed {
  const root = parse(html);
  const attrsOf = (n: {
    rawTagName: string;
    attributes: Record<string, string>;
  }) => ({
    tag: n.rawTagName,
    classes: (n.attributes.class ?? "").split(/\s+/).filter(Boolean),
    attrs: n.attributes,
  });
  const lists = root.querySelectorAll("details[data-variant-dd] > ul");
  if (lists.length === 0) throw new Error("нет раскрываемого списка вариаций");
  const chain: Parsed["chain"] = [];
  let node: ReturnType<typeof parse> | null = lists[lists.length - 1];
  while (node && (node as unknown as { rawTagName?: string }).rawTagName) {
    const n = node as unknown as {
      rawTagName: string;
      attributes: Record<string, string>;
      parentNode: unknown;
    };
    chain.push(attrsOf(n));
    if (n.attributes["data-puck-component-id"] != null) break;
    node = n.parentNode as never;
  }
  const siblings = root
    .querySelectorAll("[data-puck-subsection-parent]")
    .map((n) => attrsOf(n as never));
  return { chain, siblings };
}

// ──────────────────────────────── прогон ────────────────────────────────

const missing = THEMES.filter(
  (t) =>
    !existsSync(resolve(SITES_ROOT, `dist/theme-sections/${t}/manifest.json`)),
);
if (missing.length) {
  throw new Error(
    `нет собранных секций: ${missing.join(", ")} — нужен pnpm build:theme-sections`,
  );
}
if (!existsSync(resolve(SITES_ROOT, "dist/preview-tailwind.css"))) {
  throw new Error(
    "нет dist/preview-tailwind.css — нужен pnpm build:preview-tailwind",
  );
}

const OVERLAY = previewOverlayRules();
const PREVIEW_TAILWIND = readFileSync(
  resolve(SITES_ROOT, "dist/preview-tailwind.css"),
  "utf-8",
);
const rendered = Object.fromEntries(
  THEMES.map((t) => [t, renderTheme(t)]),
) as Record<Theme, Record<Shape, string>>;
const bundleOf = (theme: Theme) =>
  // Порядок как в превью: preview-tailwind, затем CSS темы (выигрывает он).
  `${PREVIEW_TAILWIND}\n${readFileSync(resolve(SITES_ROOT, `dist/theme-css/${theme}.css`), "utf-8")}`;

describe("раскрытый список вариаций лежит поверх счётчика и кнопки", () => {
  it("подсветка подсекций вообще существует — иначе проверка сторожит пустоту", () => {
    const parents = OVERLAY.filter((r) =>
      r.selector.includes("data-puck-subsection-parent"),
    );
    expect(parents.length).toBeGreaterThan(0);
    expect(parents.some((r) => /position\s*:\s*relative/.test(r.body))).toBe(
      true,
    );
    expect(
      OVERLAY.some((r) =>
        SUBSECTION_STATE.some((attr) =>
          r.selector.includes(attr.split("=")[0]),
        ),
      ),
    ).toBe(true);
  });

  describe.each(THEMES)("%s", (theme) => {
    describe.each(SHAPES)("форма «%s»", (shape) => {
      const parsedOf = () => parseSection(rendered[theme][shape]);

      it.each(["hover", "selected"] as const)(
        "секция в состоянии «%s»: ни один предок списка не создаёт контекста наложения",
        (state) => {
          const { chain } = parsedOf();
          const guilty = chain
            .slice(1) // сам <ul> исключаем: ему контекст иметь можно и нужно
            .map((n) => computeStyle(n, bundleOf(theme), OVERLAY, state))
            .map((s) => ({ s, reason: stackingContextReason(s) }))
            .filter((x) => x.reason);
          expect(
            guilty.map(
              (x) =>
                `<${x.s.tag}${x.s.field ? ` [${x.s.field}]` : ""}${x.s.componentId ? ` #${x.s.componentId}` : ""}> — ${x.reason}`,
            ),
          ).toEqual([]);
        },
      );

      it.each(["hover", "selected"] as const)(
        "секция в состоянии «%s»: ни один предок списка не режет содержимое",
        (state) => {
          const { chain } = parsedOf();
          const clipping = chain
            .slice(1)
            .map((n) => computeStyle(n, bundleOf(theme), OVERLAY, state))
            .map((s) => ({ s, reason: clipReason(s) }))
            .filter((x) => x.reason);
          expect(
            clipping.map(
              (x) =>
                `<${x.s.tag}${x.s.field ? ` [${x.s.field}]` : ""}> — ${x.reason}`,
            ),
          ).toEqual([]);
        },
      );

      it("список позиционирован и имеет положительный z-index", () => {
        const { chain } = parsedOf();
        const ul = computeStyle(chain[0], bundleOf(theme), OVERLAY, "hover");
        expect(ul.props.position).toBeDefined();
        expect(ul.props.position).not.toBe("static");
        const z = Number(ul.props["z-index"]);
        expect(Number.isFinite(z)).toBe(true);
        expect(z).toBeGreaterThan(0);
      });

      it("соседние обёртки параметров позиционированы — значит z-index списку нужен", () => {
        const { siblings } = parsedOf();
        const fields = siblings.map(
          (n) => n.attrs["data-puck-subsection-field"] ?? "?",
        );
        // Калибровка: рядом со «Вариантами» действительно стоят «Количество» и
        // «Кнопки» — те самые соседи со скриншота тестировщика.
        expect(fields).toEqual(
          expect.arrayContaining(["variants", "quantity", "buttons"]),
        );
        for (const sib of siblings) {
          const s = computeStyle(sib, bundleOf(theme), OVERLAY, "hover");
          expect(s.props.position).not.toBe("static");
        }
      });
    });
  });
});

describe("причина: подсветка подсекций не поднимает их в стеке", () => {
  it("ни одно правило подсветки не создаёт контекста наложения", () => {
    const guilty = OVERLAY.filter((r) =>
      r.selector.includes("data-puck-subsection"),
    )
      .map((r) => {
        const node = {
          tag: "div",
          classes: [],
          attrs: {
            "data-puck-subsection-parent": "X",
            "data-puck-subsection-field": "variants",
          },
        };
        const applies = overlayMatches(r.selector, {
          attrs: {
            ...node.attrs,
            "data-puck-subsection-hover": "true",
            "data-puck-subsection-selected": "true",
          },
          classes: [],
        });
        if (!applies) return null;
        const props: Record<string, string> = {};
        for (const prop of SC_PROPS) {
          const decl = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(
            r.body,
          );
          if (decl) props[prop] = decl[1].trim();
        }
        // Обёртка позиционирована правилом [data-puck-subsection-parent].
        const merged: NodeStyle = {
          tag: "div",
          field: "variants",
          componentId: null,
          props: { position: "relative", ...props },
        };
        const reason = stackingContextReason(merged);
        return reason ? `${r.selector} — ${reason}` : null;
      })
      .filter(Boolean);
    expect(guilty).toEqual([]);
  });

  it("саботаж: вернули z-index подсветке — проверка краснеет", () => {
    const sabotaged: NodeStyle = {
      tag: "div",
      field: "variants",
      componentId: null,
      props: { position: "relative", "z-index": "3" },
    };
    expect(stackingContextReason(sabotaged)).toBe("relative + z-index:3");
  });

  it("саботаж: контекст наложения ловится и без z-index", () => {
    for (const [prop, value] of [
      ["transform", "translateZ(0)"],
      ["filter", "blur(1px)"],
      ["opacity", "0.99"],
      ["isolation", "isolate"],
      ["contain", "paint"],
      ["will-change", "transform"],
      ["mix-blend-mode", "multiply"],
    ] as const) {
      expect(
        stackingContextReason({
          tag: "div",
          field: "variants",
          componentId: null,
          props: { position: "static", [prop]: value },
        }),
      ).not.toBeNull();
    }
  });

  it("саботаж: обрезка предком ловится", () => {
    expect(
      clipReason({
        tag: "div",
        field: "variants",
        componentId: null,
        props: { overflow: "hidden" },
      }),
    ).toBe("overflow:hidden");
  });
});
