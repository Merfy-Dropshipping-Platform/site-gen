/**
 * Регистр текста мерчанта: витрина показывает то, что он ввёл.
 *
 * Баг-репорт владельца: «мерчант пишет в инпуте сайдбара НЕ капсом — а
 * выводится капсом. Если бы он хотел капс, он бы сам написал капсом».
 * `text-transform: uppercase` поверх значения из панели — это подмена ввода.
 *
 * Граница проверки ровно та же, что у правки: сторожим ТОЛЬКО узлы, куда
 * приходит значение мерчанта (заголовок секции, текст, подпись кнопки,
 * заголовки элементов списков). Собственные подписи темы («Отправить»,
 * «Оформить заказ», «Корзина»), логотип и пейджер слайдшоу капс сохраняют —
 * их мерчант не вводит, и они намеренно НЕ проверяются.
 *
 * Как меряем. Секция рендерится РЕАЛЬНЫМ скомпилированным модулем темы (тем
 * же, что уходит на витрину и в превью), в текстовые поля кладутся строчные
 * маркеры. Дальше ищем маркер в разметке и поднимаемся по цепочке предков:
 * `text-transform` наследуется, поэтому капс на любом предке — тоже подмена.
 *
 * Что этот тест НЕ ловит: капс, приходящий не классом, а правилом CSS темы
 * (браузера здесь нет). Такие места закрыты отдельным блоком проверок ниже —
 * он сторожит сами правила в исходниках тем.
 *
 * Требует собранных секций: pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Маркеры намеренно строчные — ровно так текст вводит мерчант. */
const M = {
  heading: "мсн-заголовок",
  text: "мсн-текст",
  button: "мсн-кнопка",
  item: "мсн-элемент",
} as const;

const base = { colorScheme: "1", padding: { top: 40, bottom: 40 } };
const button = { text: M.button, link: "#" };

/**
 * Блоки и пропсы. Набор — секции, у которых в панели есть текстовые поля;
 * блоки, которых в теме нет, рендерер отдаёт как missing и они пропускаются.
 */
const JOBS: { block: string; props: Record<string, unknown> }[] = [
  {
    block: "Hero",
    props: {
      ...base,
      id: "Hero-1",
      heading: { text: M.heading },
      text: { content: M.text },
      primaryButton: button,
      secondaryButton: { text: M.button, link: "#" },
    },
  },
  {
    block: "MainText",
    props: {
      ...base,
      id: "MainText-1",
      heading: { text: M.heading },
      text: { content: M.text },
      button,
    },
  },
  {
    block: "ImageWithText",
    props: {
      ...base,
      id: "IWT-1",
      heading: { text: M.heading },
      text: { content: M.text },
      button,
    },
  },
  {
    block: "MultiColumns",
    props: {
      ...base,
      id: "MC-1",
      heading: M.heading,
      buttonText: M.button,
      columns: [
        {
          id: "c1",
          heading: M.item,
          title: M.item,
          text: M.text,
          linkText: M.button,
          link: "#",
        },
      ],
    },
  },
  {
    block: "MultiRows",
    props: {
      ...base,
      id: "MR-1",
      heading: M.heading,
      rows: [
        { id: "r1", heading: M.item, title: M.item, text: M.text, button },
      ],
    },
  },
  {
    block: "CollapsibleSection",
    props: {
      ...base,
      id: "CS-1",
      heading: M.heading,
      sections: [{ id: "s1", heading: M.item, content: M.text }],
    },
  },
  {
    block: "Collections",
    props: { ...base, id: "Col-1", heading: M.heading, subtitle: M.text },
  },
  {
    block: "PopularProducts",
    props: { ...base, id: "Pop-1", heading: M.heading, text: M.text },
  },
  {
    block: "Gallery",
    props: { ...base, id: "Gal-1", heading: M.heading, subtitle: M.text },
  },
  {
    block: "Slideshow",
    props: {
      ...base,
      id: "Sl-1",
      slides: [
        {
          id: "s1",
          heading: { text: M.heading },
          text: { content: M.text },
          button,
        },
      ],
    },
  },
  {
    block: "Newsletter",
    props: {
      ...base,
      id: "NL-1",
      heading: { text: M.heading },
      buttonText: M.button,
    },
  },
  {
    block: "ContactForm",
    props: { ...base, id: "CF-1", heading: M.heading, subtitle: M.text },
  },
  {
    block: "Publications",
    props: { ...base, id: "Pub-1", heading: M.heading },
  },
  { block: "Video", props: { ...base, id: "Vid-1", heading: M.heading } },
];

/**
 * Единственное исключение классового сторожа: три порта rose рендерят
 * заголовок компонентом NtSectionHeading из внешнего пакета
 * design-systems-theme — `uppercase` вшит в его разметку, и правкой темы его
 * оттуда не убрать. Тема снимает капс правилом по id (проверка на само правило
 * — в блоке «правила CSS тем» ниже). Список закрытый: пропускаем ровно эти id,
 * а не «любой узел с id».
 */
const NEUTRALIZED_BY_CSS = new Set([
  "collections-title",
  "popular-title",
  "gallery-title",
]);

/** Самозакрывающиеся теги — в стек предков не кладутся. */
const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

type Node = { cls: string; id: string };

/**
 * Цепочка предков (включая сам узел) для каждого вхождения маркера.
 * Разбор стеком тегов: готового DOM в jest нет, а тянуть парсер ради одной
 * проверки — лишняя зависимость.
 */
function ancestorsOf(html: string, marker: string): Node[][] {
  const hits: Node[][] = [];
  const stack: Node[] = [];
  const re = /<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [tag, name, attrs, textChunk] = m;
    if (textChunk !== undefined) {
      if (textChunk.includes(marker)) hits.push([...stack]);
      continue;
    }
    const lower = name.toLowerCase();
    if (tag.startsWith("</")) {
      const i = stack.length - 1;
      if (i >= 0) stack.pop();
      continue;
    }
    // Маркер может сидеть и в атрибуте (aria-label, alt) — это не текст узла.
    const cls = /class(?::list)?="([^"]*)"/.exec(attrs ?? "")?.[1] ?? "";
    const id = /\bid="([^"]*)"/.exec(attrs ?? "")?.[1] ?? "";
    if (!tag.endsWith("/>") && !VOID.has(lower)) stack.push({ cls, id });
  }
  return hits;
}

function renderTheme(theme: string): Record<string, string | null> {
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(JOBS)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as {
    block: string;
    html?: string;
    missing?: boolean;
    error?: string;
  }[];
  const out: Record<string, string | null> = {};
  for (const r of rows)
    out[r.block] = r.missing || r.error ? null : (r.html ?? "");
  return out;
}

describe.each(THEMES)("регистр текста мерчанта — %s", (theme) => {
  const built = existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );
  let rendered: Record<string, string | null>;

  beforeAll(() => {
    if (built) rendered = renderTheme(theme);
  }, 120_000);

  it("секции темы собраны (pnpm build:theme-sections:all)", () => {
    expect(built).toBe(true);
  });

  for (const { block } of JOBS) {
    for (const [role, marker] of Object.entries(M)) {
      it(`${block}: ${role} мерчанта выводится без принудительного капса`, () => {
        if (!built) return;
        const html = rendered[block];
        if (html == null) return; // в этой теме такой секции нет
        const hits = ancestorsOf(html, marker);
        if (hits.length === 0) return; // это поле секция не выводит
        const capsed = hits
          .filter((chain) =>
            chain.some((n) => /(^|\s)uppercase(\s|$)/.test(n.cls)),
          )
          .filter((chain) => !chain.some((n) => NEUTRALIZED_BY_CSS.has(n.id)))
          .map((chain) => chain.map((n) => n.cls));
        expect(capsed).toEqual([]);
      });
    }
  }
});

/**
 * Вторая половина: капс, который приходит не классом в разметке, а правилом в
 * CSS темы. Классовый сторож выше его не видит (браузера в jest нет), поэтому
 * сторожим сами правила в исходниках.
 */
describe("регистр текста мерчанта — правила CSS тем", () => {
  const css = (p: string) => readFileSync(resolve(SITES_ROOT, p), "utf-8");
  const rule = (text: string, selector: string): string => {
    const i = text.indexOf(selector + " {");
    return i < 0 ? "" : text.slice(i, text.indexOf("}", i));
  };

  const GLOBALS = [
    ...THEMES.map((t) => `themes/${t}/src/styles/global.css`),
    "packages/theme-base/styles/global.css",
  ];

  it.each(GLOBALS)(
    "%s: имя товара в личном кабинете не красится в капс",
    (file) => {
      expect(
        rule(css(file), ".account-product-card .product-name"),
      ).not.toMatch(/text-transform:\s*uppercase/);
    },
  );

  it("rose: заголовок секции (.rose-title) без капса по умолчанию", () => {
    expect(
      rule(css("themes/rose/src/styles/global.css"), ".rose-title"),
    ).not.toMatch(/text-transform:\s*var\([^)]*uppercase\)/);
  });

  it("rose: манифест темы не навязывает капс заголовкам", () => {
    const manifest = JSON.parse(css("packages/theme-rose/theme.json")) as {
      defaults?: Record<string, string>;
    };
    expect(manifest.defaults?.["--text-transform-heading"]).not.toBe(
      "uppercase",
    );
  });

  it("rose: заголовки трёх портов из внешнего NtSectionHeading раскапсливаются темой", () => {
    // Компонент живёт в пакете design-systems-theme, `uppercase` вшит в его
    // разметку и правкой темы не снимается — тема снимает его по id заголовка.
    const text = css("themes/rose/src/styles/global.css");
    for (const id of [
      "#collections-title",
      "#popular-title",
      "#gallery-title",
    ]) {
      expect(text).toContain(id);
    }
    expect(text).toMatch(
      /#collections-title,\s*#popular-title,\s*#gallery-title\s*\{\s*text-transform:\s*none;/,
    );
  });

  it("satin: подпись кнопки (.satin-button) не красится в капс", () => {
    expect(
      rule(css("themes/satin/src/styles/global.css"), ".satin-button"),
    ).not.toMatch(/text-transform:\s*uppercase/);
  });

  it.each(["vanilla", "bloom"])(
    "%s: имя товара и коллекции в карточке выводится как введено",
    (theme) => {
      const manifest = JSON.parse(
        css(`packages/theme-${theme}/theme.json`),
      ) as { blockDefaults?: Record<string, Record<string, unknown>> };
      const defaults = manifest.blockDefaults ?? {};
      for (const block of ["Collections", "PopularProducts", "Catalog"]) {
        expect(defaults[block]?.cardCaptionStyle).not.toBe("uppercase");
      }
    },
  );
});
