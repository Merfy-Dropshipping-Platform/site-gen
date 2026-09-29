/**
 * @jest-environment jsdom
 *
 * Помощник astro-inline-script: исполняет инлайн-скрипты `.astro` с
 * переменными define:vars и пишет покрытие под путём `.astro` с номерами строк
 * самого файла.
 */
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  astroInlineRunners,
  defineVarsNames,
} from "./helpers/astro-inline-script";

const SAMPLE = [
  "---", // 1
  "const id = 'x';", // 2
  "---", // 3
  '<div data-block="sample"></div>', // 4
  "<script is:inline define:vars={{ blockId: id, label }}>", // 5
  '  window.__first = blockId + ":" + label;', // 6
  "</script>", // 7
  "<script is:inline set:html={SOMETHING}></script>", // 8
  "<script is:inline>", // 9
  "  if (window.__flag) {", // 10
  "    window.__second = 'yes';", // 11
  "  }", // 12
  "</script>", // 13
].join("\n");

function sampleFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "astro-inline-"));
  const file = join(dir, "Sample.astro");
  writeFileSync(file, SAMPLE);
  return file;
}

type FileCoverage = {
  statementMap: Record<string, { start: { line: number } }>;
  s: Record<string, number>;
};
const coverageOf = (file: string): FileCoverage =>
  (globalThis as unknown as { __coverage__: Record<string, FileCoverage> })
    .__coverage__[file];

describe("astro-inline-script", () => {
  it("разбирает только запятые верхнего уровня и отбрасывает не-идентификаторы", () => {
    expect(
      defineVarsNames(
        'is:inline define:vars={{ a, b: Math.max(1, x), c: { d, e }, "q": 1 }}',
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("не считает скриптом упоминание <script> внутри комментария и выравнивает многострочный тег", () => {
    const src = [
      "<div>", // 1
      "  {/* тесты берут ПЕРВЫЙ <script> блока */}", // 2
      "</div>", // 3
      "<script", // 4
      "  is:inline", // 5
      "  define:vars={{ limit: count > 1 ? 2 : 1 }}", // 6
      ">", // 7
      '  window.__who = this === window ? "window" : "other";', // 8
      "  window.__limit = limit;", // 9
      "</script>", // 10
    ].join("\n");
    const dir = mkdtempSync(join(tmpdir(), "astro-inline-"));
    const file = join(dir, "Multiline.astro");
    writeFileSync(file, src);

    const runners = astroInlineRunners(file);
    expect(runners.map((r) => r.line)).toEqual([4]);
    expect(runners[0].params).toEqual(["limit"]);

    runners[0].run({ limit: 2 });
    expect((window as unknown as { __who: string }).__who).toBe("window");
    expect((window as unknown as { __limit: number }).__limit).toBe(2);

    const cov = coverageOf(file);
    const lines = Object.values(cov.statementMap).map((loc) => loc.start.line);
    expect(lines).toEqual(expect.arrayContaining([8, 9]));
  });

  it("разбирает имена define:vars, в том числе с переименованием", () => {
    expect(
      defineVarsNames("is:inline define:vars={{ blockId: id, label }}"),
    ).toEqual(["blockId", "label"]);
    expect(defineVarsNames("is:inline")).toEqual([]);
  });

  it("исполняет только is:inline со своим телом и передаёт define:vars по имени", () => {
    const file = sampleFile();
    const runners = astroInlineRunners(file);
    expect(runners.map((r) => r.line)).toEqual([5, 9]);
    expect(runners[0].params).toEqual(["blockId", "label"]);

    runners[0].run({ blockId: "b1", label: "Метка" });
    expect((window as unknown as { __first: string }).__first).toBe("b1:Метка");
  });

  it("пишет покрытие под путём .astro с номерами строк самого файла", () => {
    const file = sampleFile();
    const [, second] = astroInlineRunners(file);
    (window as unknown as { __flag: boolean }).__flag = false;
    second.run();

    const cov = coverageOf(file);
    const lineHits = Object.entries(cov.statementMap).map(([id, loc]) => [
      loc.start.line,
      cov.s[id],
    ]);
    // строка 11 не исполнилась (флаг выключен), строки 6 и 10 — операторы файла
    expect(lineHits).toEqual(
      expect.arrayContaining([
        [6, 0],
        [10, 1],
        [11, 0],
      ]),
    );
  });
});
