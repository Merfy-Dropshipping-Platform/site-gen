/**
 * @jest-environment jsdom
 *
 * «Сворачиваемый раздел» → «Размер заголовка» меняет ТОЛЬКО заголовок секции.
 *
 * Владелец, 23.09: «должен применяться только к заголовку секции, а не
 * разделам, все темы». Замер браузером (вычисленный font-size, 1280 px):
 * заголовок секции 17 → 24 px во всех темах; ряды разделов не менялись в
 * rose/bloom/vanilla/flux, а в satin шли за ним (17 → 24): её ряд брал размер
 * из того же `headingSize`.
 *
 * Проверка — по разметке рядов: при «Маленький», «Средний» и «Большой» ряд
 * раздела обязан быть байт-в-байт одинаковым. А заголовок секции обязан
 * меняться, иначе проверка сторожила бы пустоту (например, если бы настройка
 * перестала работать совсем).
 */
import { renderSections } from "../../../scripts/qa/lib/render";

const ТЕМЫ = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
const РАЗМЕРЫ = ["small", "medium", "large"] as const;
const РАЗДЕЛЫ = [
  { heading: "РАЗДЕЛ_1", title: "РАЗДЕЛ_1", content: "текст раздела" },
  { heading: "РАЗДЕЛ_2", title: "РАЗДЕЛ_2", content: "текст раздела" },
];

function рендер(тема: string, size: string): Document {
  const [r] = renderSections(тема, [
    {
      block: "CollapsibleSection",
      props: {
        id: "Collapsible-1",
        colorScheme: "scheme-1",
        heading: { text: "ЗАГОЛОВОК_СЕКЦИИ", size },
        headingSize: size,
        sections: РАЗДЕЛЫ,
        items: РАЗДЕЛЫ,
      },
    },
  ]);
  if (r.error) throw new Error(`${тема}: ${r.error}`);
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = (r.html ?? "").replace(
    /<script[^>]*>[\s\S]*?<\/script>/g,
    "",
  );
  return doc;
}

const лист = (doc: Document, текст: string): Element | null =>
  Array.from(doc.querySelectorAll("*")).find(
    (e) => e.children.length === 0 && (e.textContent ?? "").includes(текст),
  ) ?? null;

/** Ряд раздела: `<details>`, пункт списка или три уровня над текстом. */
function ряд(doc: Document, текст: string): string {
  const leaf = лист(doc, текст);
  if (!leaf) return "нет ряда";
  const row =
    leaf.closest("details, li, [role='listitem']") ??
    leaf.parentElement?.parentElement?.parentElement ??
    leaf;
  return row.outerHTML;
}

/** Заголовок секции с предками до корня секции — туда и ложится размер. */
function заголовок(doc: Document): string {
  const leaf = лист(doc, "ЗАГОЛОВОК_СЕКЦИИ");
  const chain: string[] = [];
  for (let e = leaf; e && e !== doc.body; e = e.parentElement) {
    chain.push(`${e.tagName}.${e.getAttribute("class") ?? ""}`);
  }
  return chain.join(" < ");
}

describe("«Размер заголовка» сворачиваемого раздела — только заголовок секции", () => {
  for (const тема of ТЕМЫ) {
    it(`${тема}: ряды разделов не зависят от размера, заголовок секции — зависит`, () => {
      const docs = РАЗМЕРЫ.map((s) => рендер(тема, s));
      const ряды = docs.map((d) => ряд(d, "РАЗДЕЛ_1"));
      expect(ряды[0]).not.toBe("нет ряда");
      expect({ тема, рядыОдинаковы: new Set(ряды).size === 1 }).toEqual({
        тема,
        рядыОдинаковы: true,
      });
      const заголовки = docs.map(заголовок);
      expect({ тема, заголовокМеняется: new Set(заголовки).size > 1 }).toEqual({
        тема,
        заголовокМеняется: true,
      });
    });
  }
});
