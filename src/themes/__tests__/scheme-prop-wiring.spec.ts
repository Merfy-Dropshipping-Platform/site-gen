/**
 * СТОРОЖ «проп colorScheme → класс на корне» (задача b84, 17.09).
 *
 * ЗАЧЕМ. `scheme-matrix.spec.ts` доказывает «класс `.color-scheme-N` на месте
 * → цвет едет за схемой». Он НЕ доказывает «мерчант выбрал схему N в панели →
 * секция реально получила класс `.color-scheme-N»: матрица рендерит каждую
 * секцию РОВНО ОДИН РАЗ с зашитым пропом (`scheme-matrix.mjs`, `renderTheme()`
 * по умолчанию = `scheme-${SCHEME_A}`, единственный вызов в `buildMatrix()`)
 * и дальше подменяет только СОДЕРЖИМОЕ CSS-правила схемы — сам проп никогда
 * не варьируется. Секция, которая игнорирует свой `colorScheme`-проп и всегда
 * печатает один и тот же класс, матрицей не ловится вообще.
 *
 * ДОКАЗАНО САБОТАЖЕМ 17.09: `themes/flux/src/components/Footer.astro:217` —
 * `const footerSchemeId = schemeIdOf(p.colorScheme)` заменён на жёсткое
 * `"1"`. После пересборки `pnpm scheme-matrix:bad` — 0 красных клеток (дыра
 * подтверждена, слепа). Этот же саботаж на ЭТОМ гарде — 1 красная клетка,
 * «flux · Footer», с точным файлом.
 *
 * ОБЪЁМ. Только «страничные» секции (`STANDALONE_SECTIONS` в
 * `scheme-prop-wiring.mjs`) — Footer/LoginSection/OrdersSection/
 * AccountSection/WishlistSection. Это ровно те секции, что печатают
 * СОБСТВЕННЫЙ класс `color-scheme-N` на СВОЁМ корне при изолированном
 * рендере (без композитора страницы) — и ровно тот список, на который
 * жаловался тестировщик 15–16.09 / владелец 17.09 (баги №6/№9). Обычные
 * контентные блоки (Hero, MultiRows, …) получают класс СНАРУЖИ от
 * `composeV2Page`/`v2-page-composer.ts` при сборке страницы — их проверка
 * этим гардом даёт ложные «красные» (проверено вручную 17.09: 44 из 50 при
 * прогоне по всем 31 блокам с полем `colorScheme`), потому что композитор
 * тут не участвует. Это отдельная, непокрытая здесь задача (TODO в
 * scheme-prop-wiring.mjs).
 *
 * Требует сборки: pnpm build && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");

type Cell = {
  theme: string;
  block: string;
  verdict: "ok" | "red";
  rootClassA: string;
  rootClassB: string;
  where: string | null;
  line: string | null;
};

type Guard = {
  cells: Cell[];
  renderFacts: Array<{ theme: string; block: string; ok: boolean; note?: string }>;
};

const HOW_TO_FIX = [
  "",
  "Секция получила проп colorScheme (напр. \"scheme-5\"), но на своём корне",
  "напечатала класс другой схемы (или не напечатала вовсе).",
  "Проверить: <Block>.astro — где вычисляется класс color-scheme-N, читает",
  "ли он РЕАЛЬНЫЙ проп (Astro.props.colorScheme через schemeIdOf), а не",
  "зашитое число.",
  "",
].join("\n");

const ENGINE = resolve(__dirname, "scheme-prop-wiring.mjs");
const built = existsSync(
  resolve(SITES_ROOT, "dist", "theme-sections", "flux", "manifest.json"),
);

let guard: Guard;

beforeAll(() => {
  if (!built) return;
  const out = execFileSync("node", [ENGINE, "--guard-json"], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  guard = JSON.parse(out) as Guard;
}, 300_000);

describe("проп colorScheme реально долетает до класса на корне (страничные секции)", () => {
  it("секции собраны (pnpm build:theme-sections:all)", () => {
    expect(built).toBe(true);
  });

  it("все клетки «тема × страничная секция» отрендерились", () => {
    if (!built) return;
    const bad = guard.renderFacts
      .filter((r) => !r.ok)
      .map((r) => `${r.theme}/${r.block}: ${r.note}`);
    expect(bad).toEqual([]);
    // 5 тем × 5 страничных секций = 25. Если стало меньше — площадь ослепла.
    expect(guard.renderFacts.length).toBe(25);
  });

  it("выбор мерчанта (colorScheme) нигде не застрял на дефолтной схеме", () => {
    if (!built) return;
    const bad = guard.cells.filter((c) => c.verdict === "red");
    if (bad.length) {
      const text = bad.map((c) => `  ${c.line}`).join("\n");
      throw new Error(`${HOW_TO_FIX}КРАСНЫЕ КЛЕТКИ (${bad.length}):\n${text}\n`);
    }
    expect(bad).toEqual([]);
  });
});
