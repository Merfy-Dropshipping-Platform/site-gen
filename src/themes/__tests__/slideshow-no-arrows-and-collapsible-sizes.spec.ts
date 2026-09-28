/**
 * @jest-environment jsdom
 *
 * Два замечания тестера 24.09, общие для всех пяти тем (rose, vanilla, flux,
 * satin, bloom):
 *
 * 1. «Убери на всех темах стрелки справа и слева» — у «Слайд-шоу» нет стрелок
 *    «назад/вперёд» ни по бокам слайда, ни в полосе нумерации (у rose они
 *    стояли вокруг чисел, у vanilla — в баре под полотном). Нумерация
 *    («Числа» / «Точки» / «Счётчик») на месте: клик по номеру и автоинтервал
 *    продолжают листать.
 * 2. «Сворачиваемый раздел» ▸ «Раздел»: в панели пункта есть «Размер
 *    заголовка» и «Размер текста» (Маленький / Средний / Большой — как у ряда
 *    MultiRows), и каждая тема применяет их в своём рендере. Без выбора и при
 *    «Средний» разметка одна и та же — прежний вид темы (что он прежний,
 *    держат снимки section-html-snapshot).
 *
 * Рендер — живая цепочка витрины (dist/theme-sections/<тема>), тот же модуль
 * отдаёт превью конструктора (POST /preview/block).
 *
 * Требует сборки: pnpm build && pnpm build:theme-sections:all && pnpm build:blocks.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { renderSections } from "../../../scripts/qa/lib/render";

const ТЕМЫ = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
const КАРТИНКА = "/placeholders/landscape-slideshow.png";
const СЛАЙДЫ = [1, 2, 3].map((n) => ({
  id: `s${n}`,
  image: КАРТИНКА,
  heading: { text: `Слайд ${n}`, size: "medium" },
  text: { content: `Текст ${n}`, size: "medium" },
  button: { text: "Кнопка", link: "/catalog" },
}));

function документ(html: string | undefined): Document {
  const doc = document.implementation.createHTMLDocument("");
  // Скрипты не в счёт: проверяется то, что видит покупатель.
  doc.body.innerHTML = (html ?? "").replace(
    /<script[^>]*>[\s\S]*?<\/script>/g,
    "",
  );
  return doc;
}

/**
 * Все случаи темы рендерятся ОДНИМ процессом (renderSections принимает список
 * заданий): по процессу на случай выходило шесть десятков холодных стартов.
 */
type Случай = { block: string; props: Record<string, unknown> };
const кэш = new Map<string, Document>();
function рендерВсех(тема: string, случаи: Record<string, Случай>): void {
  const имена = Object.keys(случаи);
  const res = renderSections(
    тема,
    имена.map((и) => ({
      block: случаи[и].block,
      props: { colorScheme: "scheme-1", ...случаи[и].props },
    })),
  );
  имена.forEach((и, i) => {
    if (res[i].error || !res[i].html)
      throw new Error(`${тема} ${и}: ${res[i].error ?? "нет HTML"}`);
    кэш.set(`${тема}|${и}`, документ(res[i].html));
  });
}
const взять = (тема: string, случай: string): Document => {
  const doc = кэш.get(`${тема}|${случай}`);
  if (!doc) throw new Error(`нет рендера ${тема}|${случай}`);
  return doc;
};

/** Всё, что похоже на стрелку листания: маркеры, подписи, глифы. */
const СТРЕЛКИ =
  "[data-slide-prev],[data-slide-next],[data-hero-prev],[data-hero-next]," +
  "[aria-label='Предыдущий слайд'],[aria-label='Следующий слайд']";
const ГЛИФЫ = /[←→‹›]/;

/** Кликабельные номера/точки нумерации (все темы размечают их одним из двух маркеров). */
const НОМЕРА = "button[data-slide-dot],button[data-hero-bullet]";

const РАЗДЕЛЫ = [
  { id: "c1", heading: "ЗАГОЛОВОК_РАЗДЕЛА", content: "ТЕКСТ_РАЗДЕЛА" },
  { id: "c2", heading: "Второй раздел", content: "Второй текст" },
];
const раздел = (sizes: Record<string, string>): Случай => ({
  block: "CollapsibleSection",
  props: {
    id: "Collapsible-1",
    heading: "Сворачиваемый раздел",
    sections: РАЗДЕЛЫ.map((s, i) => (i === 0 ? { ...s, ...sizes } : s)),
  },
});
const слайдшоу = (props: Record<string, unknown>): Случай => ({
  block: "Slideshow",
  props: { id: "Slideshow-1", slides: СЛАЙДЫ, ...props },
});
const РАЗМЕРЫ_ЗНАЧ = ["small", "medium", "large"] as const;
const ПОЛЯ_РАЗМЕРА = ["headingSize", "textSize"] as const;

const СЛУЧАИ: Record<string, Случай> = {
  "ss-numbers": слайдшоу({ pagination: "numbers" }),
  "ss-dots": слайдшоу({ pagination: "dots" }),
  "ss-counter": слайдшоу({ pagination: "counter" }),
  "ss-empty": слайдшоу({ slides: [] }),
  "cs-none": раздел({}),
  "cs-medium": раздел({ headingSize: "medium", textSize: "medium" }),
  ...Object.fromEntries(
    ПОЛЯ_РАЗМЕРА.flatMap((поле) =>
      РАЗМЕРЫ_ЗНАЧ.map((v) => [`cs-${поле}-${v}`, раздел({ [поле]: v })]),
    ),
  ),
};

beforeAll(() => {
  for (const тема of ТЕМЫ) рендерВсех(тема, СЛУЧАИ);
});

describe("Слайд-шоу: стрелок нет, нумерация на месте", () => {
  for (const тема of ТЕМЫ) {
    for (const pagination of ["numbers", "dots"] as const) {
      it(`${тема} · ${pagination}: без стрелок, ${СЛАЙДЫ.length} кликабельных номера`, () => {
        const doc = взять(тема, `ss-${pagination}`);
        expect(doc.querySelectorAll(СТРЕЛКИ).length).toBe(0);
        expect(ГЛИФЫ.test(doc.body.textContent ?? "")).toBe(false);
        expect(doc.querySelectorAll(НОМЕРА).length).toBe(СЛАЙДЫ.length);
      });
    }

    it(`${тема} · counter: без стрелок, счётчик «1 / ${СЛАЙДЫ.length}» на месте`, () => {
      const doc = взять(тема, "ss-counter");
      expect(doc.querySelectorAll(СТРЕЛКИ).length).toBe(0);
      expect(ГЛИФЫ.test(doc.body.textContent ?? "")).toBe(false);
      const счётчик = doc.querySelector(
        "[data-slide-counter],[data-slide-dot],[data-hero-bullet]",
      );
      expect((счётчик?.textContent ?? "").replace(/\s+/g, "")).toContain(
        `1/${СЛАЙДЫ.length}`,
      );
    });

    it(`${тема} · пустое состояние: без стрелок`, () => {
      const doc = взять(тема, "ss-empty");
      expect(doc.querySelectorAll(СТРЕЛКИ).length).toBe(0);
      expect(ГЛИФЫ.test(doc.body.textContent ?? "")).toBe(false);
    });
  }
});

/** Класс листа с текстом и его родителя — туда ложится размер. */
function классТекста(doc: Document, текст: string): string {
  const leaf = Array.from(doc.querySelectorAll("*")).find(
    (e) => e.children.length === 0 && (e.textContent ?? "").includes(текст),
  );
  if (!leaf) return "нет элемента";
  const parent = leaf.parentElement;
  return `${leaf.getAttribute("class") ?? ""} < ${parent?.getAttribute("class") ?? ""}`;
}

const СВОЙ_ТЕКСТ: Record<(typeof ПОЛЯ_РАЗМЕРА)[number], [string, string]> = {
  headingSize: ["ЗАГОЛОВОК_РАЗДЕЛА", "ТЕКСТ_РАЗДЕЛА"],
  textSize: ["ТЕКСТ_РАЗДЕЛА", "ЗАГОЛОВОК_РАЗДЕЛА"],
};

describe("«Раздел»: размер заголовка и размер текста пункта", () => {
  for (const тема of ТЕМЫ) {
    it(`${тема}: без выбора и «Средний» — одна и та же разметка`, () => {
      expect(взять(тема, "cs-medium").body.innerHTML).toBe(
        взять(тема, "cs-none").body.innerHTML,
      );
    });

    for (const поле of ПОЛЯ_РАЗМЕРА) {
      it(`${тема} · ${поле}: три размера — три вида, соседний текст и второй пункт не трогаются`, () => {
        const [свой, чужой] = СВОЙ_ТЕКСТ[поле];
        const docs = РАЗМЕРЫ_ЗНАЧ.map((v) => взять(тема, `cs-${поле}-${v}`));
        expect(new Set(docs.map((d) => классТекста(d, свой))).size).toBe(3);
        expect(new Set(docs.map((d) => классТекста(d, чужой))).size).toBe(1);
        expect(
          new Set(docs.map((d) => классТекста(d, "Второй раздел"))).size,
        ).toBe(1);
        expect(
          new Set(docs.map((d) => классТекста(d, "Второй текст"))).size,
        ).toBe(1);
      });
    }
  }
});

describe("«Раздел»: поля размеров в панели каждой темы", () => {
  const RAW = resolve(__dirname, "puck-config-raw.mjs");
  const SITES_ROOT = resolve(__dirname, "..", "..", "..");
  const РАЗМЕРЫ = ["small=Маленький", "medium=Средний", "large=Большой"];

  for (const тема of ТЕМЫ) {
    it(`${тема}: «Размер заголовка» и «Размер текста», по умолчанию «Средний»`, () => {
      const cfg = JSON.parse(
        execFileSync("node", [RAW, тема], {
          cwd: SITES_ROOT,
          encoding: "utf-8",
          maxBuffer: 64 * 1024 * 1024,
        }),
      );
      const sections = cfg.components.CollapsibleSection.fields.sections;
      const поле = (имя: string) => {
        const f = sections.arrayFields[имя];
        return {
          type: f?.type,
          label: f?.label,
          options: (f?.options ?? []).map(
            (o: { value: string; label: string }) => `${o.value}=${o.label}`,
          ),
        };
      };
      expect(поле("headingSize")).toEqual({
        type: "select",
        label: "Размер заголовка",
        options: РАЗМЕРЫ,
      });
      expect(поле("textSize")).toEqual({
        type: "select",
        label: "Размер текста",
        options: РАЗМЕРЫ,
      });
      expect(sections.defaultItemProps).toMatchObject({
        headingSize: "medium",
        textSize: "medium",
      });
    });
  }
});
