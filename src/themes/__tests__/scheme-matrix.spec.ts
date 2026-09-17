/**
 * СПЛОШНАЯ МАТРИЦА «тема × секция × мишень» против цветовой схемы.
 *
 * ЗАЧЕМ. Из 63 пунктов баг-репорта тестировщика примерно 25 — одна и та же
 * жалоба разными словами: «не применяется цветовая схема» к секции / кнопке /
 * заголовку / товару / контейнеру в такой-то теме. Точечный гард
 * `section-scheme-targets.spec.ts` закрывает 23 клетки по списку, набитому
 * РУКАМИ, — поэтому мы всегда отстаём от тестировщика ровно на один круг.
 * Здесь механика того гарда (она проверена) разложена на всю площадь:
 * 5 тем × 26 секций, а мишени внутри секции находятся САМИ — обходом
 * отрендеренной разметки. Руками задаются только карта «маркер → ожидаемая
 * роль схемы» (`TARGET_RULES`) и белый список законных литералов (`ALLOWED`),
 * оба — в `scheme-matrix.mjs` с объяснениями.
 *
 * ЗНАМЕНАТЕЛЬ (замер 15.09, origin/main 911dd450): 130 клеток «тема × секция»,
 * 801 мишень. Мишень — узел, который КРАСИТ СЕБЯ САМ (есть побеждающее
 * объявление `background-color`/`color`); наследующие цвет узлы в знаменатель
 * не идут, спрашивать с них нечего.
 *   зелёных 602 · красных 159 · в белом списке 40
 *   (поиск в шапке 20 · семафор формы 11 · --color-error 9).
 *
 * ЗАМЕР 15.09 ПОСЛЕ ПАЧКИ b21 (origin/main 2fb9be8c + fix/b21-palette): те же
 * 130 клеток, 803 мишени. Закрыт весь класс `palette` — 58 клеток, где цвет
 * приходил из --color-white/--color-black (`bg-white`, `text-white`,
 * `bg-black`, `text-black`): 43 переведены на роли схемы, 15 признаны
 * намеренным дизайном и ушли в белый список тремя правилами (надпись/кнопка/
 * точки/скрим ВНУТРИ кадра слайда — 8; плашка «Скидка» поверх фото товара — 2;
 * счётчик корзины и избранного в шапке, пара «плашка + цифра» фирменного
 * цвета — 5).
 *   зелёных 696 · красных 52 · в белом списке 55.
 *   Контроль «ничего лишнего не поехало»: 803 мишени до и 803 после, ни одна
 *   ЧУЖАЯ клетка не сменила ни цвет, ни приговор (сверка полного JSON матрицы
 *   на origin/main против ветки).
 *
 * ЧЕМ ДОКАЗАНО, ЧТО МАТРИЦА НЕ ВРЁТ. Двумя независимыми замерами:
 *   1) `scripts/qa/calibrate-scheme-matrix.mjs` — те же секции открываются в
 *      настоящем chromium дважды (схема A и схема B), и `getComputedStyle`
 *      каждого узла сверяется с приговором матрицы. 800 клеток, 0 расхождений;
 *   2) `scripts/qa/verify-scheme-matrix-live.mjs` — замер на ПЯТИ ЖИВЫХ
 *      стендах: у секции клиентски перебирается класс `color-scheme-N` (то же
 *      самое делает мерчант в конструкторе), рядом печатается контроль
 *      `--color-bg` обёртки. 136 подозреваемых узлов, 136 стоят на месте,
 *      0 опровержений; контроль поехал везде.
 *
 * ЧТО СТОРОЖИТ ЭТОТ ФАЙЛ:
 *   • НОВАЯ красная клетка = падение с человеческим списком задач
 *     «тема · секция · мишень · что пришло вместо схемы · файл:строка»;
 *   • ПОЧИНЕННЫЙ долг = тоже падение («убери строку из реестра») — это та
 *     самая инвертированная проверка, без которой реестр зарастает;
 *   • состав белого списка — чтобы «законных литералов» не становилось больше
 *     молча.
 *
 * Полная карта покрытия печатается командой:
 *   node src/themes/__tests__/scheme-matrix.mjs            (сводка)
 *   node src/themes/__tests__/scheme-matrix.mjs --bad      (список задач)
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const DEBT_FILE = resolve(SITES_ROOT, "conformance", "scheme-matrix-debt.json");

type Cell = {
  key: string;
  theme: string;
  block: string;
  target: string;
  prop: string;
  cls: string;
  verdict: string;
  allowedBy: string | null;
  role: string | null;
  a: string;
  b: string;
  count: number;
  /** Готовая строка отчёта: тема · секция · мишень · что пришло · файл:строка. */
  line: string;
};

type Debt = {
  key: string;
  verdict: string;
  where: string | null;
  value: string;
};

const HOW_TO_FIX = [
  "",
  "Матрица нашла краску, которая НЕ едет за цветовой схемой мерчанта.",
  "",
  "Если это дефект (обычный случай) — чинить в ветке темы, не здесь.",
  "Если литерал законен (плашка-заглушка, семафор формы, вуаль над фото) —",
  "  добавить правило в ALLOWED в src/themes/__tests__/scheme-matrix.mjs",
  "  ОБЯЗАТЕЛЬНО с объяснением, почему схема здесь ни при чём.",
  "Если это известный долг другой ветки — внести строкой в",
  "  conformance/scheme-matrix-debt.json (node src/themes/__tests__/scheme-matrix.mjs --debt-out <файл>).",
  "",
].join("\n");

// jest (CJS) не грузит ESM-модуль матрицы в своём процессе — поднимаем его
// дочерним процессом и читаем JSON, ровно как это делают panel-canon.spec.ts
// и section-html-snapshot.spec.ts.
type Guard = {
  renderFacts: Array<{
    theme: string;
    block: string;
    ok: boolean;
    note?: string;
  }>;
  allowed: Array<{ id: string; why: string }>;
  cells: Cell[];
};

const ENGINE = resolve(__dirname, "scheme-matrix.mjs");
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
}, 600_000);

const debt: { total: number; entries: Debt[] } = JSON.parse(
  readFileSync(DEBT_FILE, "utf8"),
);

describe("матрица «тема × секция × мишень» против цветовой схемы", () => {
  it("секции собраны (pnpm build:theme-sections:all)", () => {
    expect(built).toBe(true);
  });

  it("все 130 клеток «тема × секция» отрендерились", () => {
    if (!built) return;
    const bad = guard.renderFacts
      .filter((r) => !r.ok)
      .map((r) => `${r.theme}/${r.block}: ${r.note}`);
    expect(bad).toEqual([]);
    expect(guard.renderFacts.length).toBe(130);
  });

  it("площадь не сжалась: мишеней не меньше, чем было при заведении гарда", () => {
    if (!built) return;
    // Если мишеней вдруг стало заметно меньше — значит разметка уехала или
    // проверка ослепла. «Ноль проверок» = зелёный прогон, поэтому за числом
    // надо следить отдельно.
    expect(guard.cells.length).toBeGreaterThanOrEqual(760);
  });

  it("новых мест мимо схемы не появилось", () => {
    if (!built) return;
    const known = new Set(debt.entries.map((e) => e.key));
    const fresh = guard.cells
      .filter((c) => !["ok", "allowed"].includes(c.verdict))
      .filter((c) => !known.has(c.key));
    if (fresh.length) {
      const grouped: Record<string, string[]> = {};
      for (const c of fresh) (grouped[c.verdict] ??= []).push(`  ${c.line}`);
      const text = Object.entries(grouped)
        .map(
          ([k, lines]) =>
            `\n### ${k} — ${lines.length}\n${lines.sort().join("\n")}`,
        )
        .join("\n");
      throw new Error(
        `${HOW_TO_FIX}НОВЫЕ КРАСНЫЕ КЛЕТКИ (${fresh.length}):\n${text}\n`,
      );
    }
    expect(fresh).toEqual([]);
  });

  it("долг починен — строку из реестра надо убрать", () => {
    if (!built) return;
    // Инвертированная проверка. Пока долг на месте, она молчит; как только
    // другая ветка чинит краску, гард падает и ЗАСТАВЛЯЕТ снять исключение —
    // иначе реестр превращается в свалку и перестаёт что-либо значить.
    const red = new Set(
      guard.cells
        .filter((c) => !["ok", "allowed"].includes(c.verdict))
        .map((c) => c.key),
    );
    const fixed = debt.entries.filter((e) => !red.has(e.key));
    if (fixed.length) {
      throw new Error(
        `Долги ПОЧИНЕНЫ (${fixed.length}) — убери их из conformance/scheme-matrix-debt.json:\n` +
          fixed.map((e) => `  ${e.key}`).join("\n"),
      );
    }
    expect(fixed).toEqual([]);
  });

  it("реестр долгов не раздут: каждая строка отвечает живой клетке", () => {
    if (!built) return;
    expect(debt.entries.length).toBe(debt.total);
    expect(new Set(debt.entries.map((e) => e.key)).size).toBe(
      debt.entries.length,
    );
  });

  it("белый список: каждое исключение объяснено", () => {
    if (!built) return;
    for (const a of guard.allowed) {
      expect(a.why.length).toBeGreaterThan(40);
    }
    // Состав белого списка фиксирован: новое исключение — это осознанное
    // решение, а не побочный эффект правки.
    expect(guard.allowed.map((a) => a.id).sort()).toEqual([
      "card-badge-over-photo",
      "counter-badge",
      "error-token",
      "form-status",
      // Заведено 15.09 осознанно: вуаль «Затемнение» героя обязана оставаться
      // тёмной при любой схеме — цвет текста над фото берёт схема, читаемость
      // держит затемнение (packages/theme-base/styles/hero-over-photo.css).
      "hero-overlay-veil",
      // Заведено 17.09 (b61, починка разбора класса в scheme-matrix.mjs):
      // тёмный холст satin ПОД full-bleed фото (Hero/ImageWithText/MultiRows/
      // Slideshow) — фиксированный #111111, согласованный паттерн темы, а не
      // роль схемы. См. объяснение в ALLOWED.
      "satin-photo-canvas",
      "search-always-scheme-1",
      "slide-over-photo",
    ]);
    // Мёртвых исключений быть не должно: правило, не покрывающее ни одной
    // клетки, ничего не сторожит, но однажды молча пропустит настоящий дефект.
    // Замер 15.09 (b21): search-always-scheme-1 20 · form-status 11 ·
    // error-token 9 · slide-over-photo 8 · counter-badge 5 ·
    // card-badge-over-photo 2.
    const used = new Set(
      guard.cells
        .filter((c) => c.verdict === "allowed")
        .map((c) => c.allowedBy),
    );
    expect(
      guard.allowed.map((a) => a.id).filter((id) => !used.has(id)),
    ).toEqual([]);
  });

  it("контроль: фон секции едет за схемой почти везде (109 из 114)", () => {
    if (!built) return;
    // Самая заметная мишень. Если это число поедет вниз — сломали корень.
    const roots = guard.cells.filter((c) => c.target === "фон секции");
    const green = roots.filter((c) => c.verdict === "ok");
    expect(roots.length).toBeGreaterThanOrEqual(110);
    expect(green.length / roots.length).toBeGreaterThan(0.9);
  });

  it("контроль: `bg-white` НЕ считается краской схемы", () => {
    if (!built) return;
    // Доказательство, что матрица ловит именно литерал, а не «наличие var()».
    // Tailwind 4 печатает `.bg-white{background-color:var(--color-white)}` —
    // переменная есть, но схемы в ней нет.
    const white = guard.cells.filter((c) => c.cls === "bg-white");
    expect(white.length).toBeGreaterThan(0);
    expect(white.every((c) => c.verdict !== "ok")).toBe(true);
  });
});
