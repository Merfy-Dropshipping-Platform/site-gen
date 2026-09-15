/**
 * Утилиты Tailwind из портов темы обязаны доезжать до бандла этой темы.
 *
 * ЗАЧЕМ. `dist/theme-css/<тема>.css` читает РОВНО один потребитель —
 * `preview.service.ts` (loadThemeCss, строки 1050-1051): это CSS, который
 * подкладывается в iframe конструктора. Живая витрина собирается отдельной
 * сборкой Astro и этот бандл не видит. Значит любая дыра здесь — не «сайт
 * сломан», а «КОНСТРУКТОР ВРЁТ»: мерчант крутит настройку, видит одно число,
 * покупатель получает другое. Недостающий класс в превью не исчезает бесследно
 * — его подменяет сосед из `preview-tailwind.css`, и расхождение молчит.
 *
 * ДВЕ БОЛЕЗНИ, обе пойманы 2026-09-15, обе дают ОДИН симптом «правило написано,
 * но не работает», и обе невидимы для снимков разметки (класс-то в HTML стоит):
 *
 *   1) НЕТ `@source` НА СОБСТВЕННЫЕ ПОРТЫ. Tailwind не сканирует
 *      `../components/**`, и ни одна утилита темы не попадает в бандл. Было у
 *      vanilla. Замер (сборка бандла с этой строкой и без неё, всё остальное
 *      неизменно):
 *
 *        vanilla.css без @source   137 748 байт   1 140 классов
 *        vanilla.css с  @source    181 160 байт   1 591 класс
 *        разница                   +43 412 байт   +451 класс, 0 потеряно
 *
 *      Практическое следствие: зазор ряда «Мультирядов» конструктор показывал
 *      16px (утилита `gap-4`), потому что `md:gap-10` в бандл не попадала, а на
 *      живом сайте тот же ряд имеет 40px. Починено в main коммитом 859425be.
 *
 *   2) КЛАСС ПРИКЛЕЕН К `${`. Сканер Tailwind не извлекает кандидата, если
 *      класс стоит вплотную к интерполяции: кандидатом становится
 *      `lg:items-center${containerSchemeCls}`, такой утилиты нет, правило молча
 *      не работает. Было у bloom в `ImageWithText.astro` (починено e396b067
 *      порядком классов как у эталона rose).
 *
 * ЧТО СТОРОЖИМ. Не строку в исходнике — строку легко переписать, оставив дыру.
 * Сторожим ФАКТ: класс, который порт пишет в разметку и который Tailwind в
 * принципе умеет сгенерить, обязан иметь правило в собственном бандле темы.
 *
 * ПОЧЕМУ БЕЗ СПИСКА ИСКЛЮЧЕНИЙ. Порты пишут в `class=` не только утилиты, но и
 * крючки для JS и CSS (`burger-icon`, `cart-checkout-btn`, `puk-card`,
 * `save-text`, `font-heading` — всего около тридцати имён на пять тем). Отличать
 * их по виду имени нельзя: `font-heading` неотличим от утилиты. Поэтому судья —
 * САМ TAILWIND: недостающий токен прогоняется через `@source inline(...)` с тем
 * же `global.css` темы. Сгенерил — это утилита, и её отсутствие в бандле есть
 * баг. Не сгенерил — это крючок, и он не наша забота. Список исключений не
 * нужен и не может устареть.
 *
 * ТРЕБУЕТ СБОРКИ (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 *   && pnpm build:preview-tailwind
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "bloom", "satin"] as const;
type Theme = (typeof THEMES)[number];

/**
 * ДОЛГ, а не «разрешено». Настоящий призрак: Tailwind этот класс генерит
 * (проверено `@source inline`), в бандле flux его нет, потому что он приклеен к
 * `${containerSchemeCls}` в `MultiColumns.astro:257`. Следствие — на ≥1024px
 * настройка числа колонок у flux мертва.
 *
 * Не чиню здесь по двум причинам: объём задачи — vanilla и общий сканер, а
 * контрольное требование смены прямо запрещает сдвигать flux хоть на пиксель.
 * Держим как долг: проверка «долг ещё на месте» ниже покраснеет, когда его
 * починят, и заставит убрать строку отсюда — иначе запись протухнет молча.
 */
const KNOWN_DEBT: ReadonlyArray<{ theme: Theme; cls: string; where: string }> = [
  {
    theme: "flux",
    cls: "lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]",
    where: "themes/flux/src/components/sections/MultiColumns.astro:257",
  },
];

const debtOf = (theme: Theme) =>
  new Set(KNOWN_DEBT.filter((d) => d.theme === theme).map((d) => d.cls));

// ───────────────────────────── чтение бандла ─────────────────────────────

/**
 * Имена классов, для которых в бандле ЕСТЬ правило.
 *
 * Разбор CSS-экранирования обязателен и он неочевиден: ведущую цифру Tailwind
 * печатает шестнадцатеричным кодом с пробелом-терминатором — `2xl:px-[300px]`
 * превращается в `.\32 xl\:px-\[300px\]`. Наивный разбор читает это как класс
 * `32` и объявляет одиннадцать живых классов bloom мёртвыми (поймано на себе).
 */
function unescapeCss(s: string): string {
  return s.replace(
    /\\(?:([0-9a-fA-F]{1,6})[ \t\n]?|([\s\S]))/g,
    (_m, hex: string | undefined, ch: string | undefined) =>
      hex ? String.fromCodePoint(parseInt(hex, 16)) : (ch as string),
  );
}

function bundleClasses(cssPath: string): Set<string> {
  const out = new Set<string>();
  for (const raw of readFileSync(cssPath, "utf8").split("\n")) {
    const line = raw.trimEnd();
    if (!line.endsWith("{")) continue;
    const sel = line.slice(0, -1);
    if (sel.trimStart().startsWith("@")) continue;
    const re =
      /\.((?:\\(?:[0-9a-fA-F]{1,6}[ \t]?|[\s\S])|[A-Za-z0-9_-])+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sel))) out.add(unescapeCss(m[1]));
  }
  return out;
}

// ──────────────────────────── чтение разметки ────────────────────────────

function astroFiles(dir: string): string[] {
  const acc: string[] = [];
  const walk = (d: string) => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".astro")) acc.push(p);
    }
  };
  walk(dir);
  return acc;
}

/** Скобки сбалансированы — значит это цельный класс, а не огрызок значения. */
function balanced(tok: string): boolean {
  let sq = 0;
  let rd = 0;
  for (const ch of tok) {
    if (ch === "[") sq++;
    else if (ch === "]") sq--;
    else if (ch === "(") rd++;
    else if (ch === ")") rd--;
    if (sq < 0 || rd < 0) return false;
  }
  return sq === 0 && rd === 0;
}

type Usage = { token: string; file: string; glued: boolean };

/**
 * Кандидаты из атрибутов `class` портов темы: и статические `class="..."`, и
 * куски шаблонной строки `class={`...`}` между интерполяциями.
 *
 * Огрызок вроде `bg-[rgb(var(--color-surface,` (это `${}` ВНУТРИ значения, как
 * у rose в `Collections.astro:349`) отсекается проверкой скобок: такой токен —
 * не класс, а часть значения, и Tailwind его и не должен генерить.
 */
function portUsages(theme: Theme): Usage[] {
  const root = join(SITES_ROOT, "themes", theme, "src", "components");
  const usages: Usage[] = [];
  const attrRe =
    /class(?::list)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\}(?=[\s/>]))/g;
  for (const file of astroFiles(root)) {
    const src = readFileSync(file, "utf8");
    const rel = relative(SITES_ROOT, file);
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(src))) {
      const body = m[1] ?? m[2] ?? m[3] ?? "";
      const gluedTokens = new Set<string>();
      // `[^...]` обязан исключать `$`, `{` и `}`, иначе токен перепрыгивает
      // через предыдущую интерполяцию: из `${gridCls} ${x}` вылезает `gridCls}`.
      const glueRe = /([A-Za-z0-9_][^\s`'"${}]*?)\$\{/g;
      let g: RegExpExecArray | null;
      while ((g = glueRe.exec(body))) gluedTokens.add(g[1]);
      for (const tok of gluedTokens) {
        if (balanced(tok)) usages.push({ token: tok, file: rel, glued: true });
      }
      for (const chunk of body.split(/\$\{[\s\S]*?\}/)) {
        for (const raw of chunk.split(/[\s`'"+,[\]]+/)) {
          const tok = raw.trim();
          if (!tok || !/^[a-z]/.test(tok)) continue;
          if (!balanced(tok)) continue;
          if (!/^[A-Za-z0-9_:\-\/.%#&!()[\]]+$/.test(tok)) continue;
          usages.push({ token: tok, file: rel, glued: false });
        }
      }
    }
  }
  return usages;
}

// ────────────────────────── судья: сам Tailwind ──────────────────────────

const CLI = (() => {
  const pkg = require.resolve("@tailwindcss/cli/package.json");
  return resolve(pkg, "..", "dist", "index.mjs");
})();

/**
 * Что из `tokens` Tailwind умеет сгенерить в контексте ЭТОЙ темы.
 * Проба — копия `global.css` темы рядом с оригиналом (иначе не резолвятся её
 * относительные `@import`/`@source`) плюс принудительный `@source inline(...)`.
 */
function tailwindCanGenerate(theme: Theme, tokens: string[]): Set<string> {
  if (tokens.length === 0) return new Set();
  const stylesDir = join(SITES_ROOT, "themes", theme, "src", "styles");
  const probe = join(stylesDir, `__tw_probe_${process.pid}.css`);
  const out = join(stylesDir, `__tw_probe_${process.pid}.out.css`);
  try {
    const base = readFileSync(join(stylesDir, "global.css"), "utf8");
    writeFileSync(
      probe,
      `${base}\n@source inline("${tokens.join(" ")}");\n`,
      "utf8",
    );
    execFileSync(process.execPath, [CLI, "-i", probe, "-o", out], {
      cwd: stylesDir,
      stdio: "pipe",
    });
    const produced = bundleClasses(out);
    return new Set(tokens.filter((t) => produced.has(t)));
  } finally {
    rmSync(probe, { force: true });
    rmSync(out, { force: true });
  }
}

// ─────────────────────────────── проверки ───────────────────────────────

const bundlePath = (theme: Theme) =>
  resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`);

const BUILT = THEMES.every((t) => existsSync(bundlePath(t)));

(BUILT ? describe : describe.skip)("утилиты портов доезжают до бандла темы", () => {
  describe("1) тема сканирует собственные порты", () => {
    for (const theme of THEMES) {
      it(`${theme}: global.css содержит @source на ../components`, () => {
        const css = readFileSync(
          join(SITES_ROOT, "themes", theme, "src", "styles", "global.css"),
          "utf8",
        );
        const globs = [...css.matchAll(/@source\s+"([^"]+)"/g)].map((m) => m[1]);
        const own = globs.filter((g) => /^\.\.\/components\//.test(g));
        expect({ theme, own }).toEqual({
          theme,
          own: ["../components/**/*.{astro,ts,tsx}"],
        });
      });
    }
  });

  describe("2) в портах нет мёртвых утилит", () => {
    for (const theme of THEMES) {
      it(`${theme}: каждая утилита портов имеет правило в бандле`, () => {
        const bundle = bundleClasses(bundlePath(theme));
        const debt = debtOf(theme);
        const usages = portUsages(theme);
        const missing = [
          ...new Map(
            usages
              .filter((u) => !bundle.has(u.token) && !debt.has(u.token))
              .map((u) => [u.token, u]),
          ).values(),
        ];
        const real = tailwindCanGenerate(
          theme,
          missing.map((u) => u.token),
        );
        const ghosts = missing
          .filter((u) => real.has(u.token))
          .map((u) => `${u.token} (${u.file}${u.glued ? ", приклеен к ${" : ""})`)
          .sort();
        expect({ theme, ghosts }).toEqual({ theme, ghosts: [] });
      });
    }
  });

  describe("3) класс, приклеенный к ${, всё равно доезжает", () => {
    for (const theme of THEMES) {
      it(`${theme}: приклеенные классы есть в бандле`, () => {
        const bundle = bundleClasses(bundlePath(theme));
        const debt = debtOf(theme);
        const glued = portUsages(theme).filter((u) => u.glued);
        expect(glued.length).toBeGreaterThan(0);
        const lost = [
          ...new Set(
            glued
              .filter((u) => !bundle.has(u.token) && !debt.has(u.token))
              .map((u) => `${u.token} (${u.file})`),
          ),
        ].sort();
        expect({ theme, lost }).toEqual({ theme, lost: [] });
      });
    }
  });

  /**
   * ДОЛГ №2, найден замером в этой же смене. У rose glob дизайн-системы ведёт в
   * КОРНЕВЫЕ node_modules сервиса (`../../../../`), которые стоят всегда. У
   * четырёх остальных тем — в node_modules САМОЙ ТЕМЫ (`../../`), которых после
   * обычного `pnpm install` в корне сервиса не существует: они появляются
   * только если тему отдельно собирали (`run-theme-build`).
   *
   * Замер satin (единственная тема, чьи node_modules оказались установлены
   * после прогона гейта): бандл 166 827 байт без них и 179 235 с ними —
   * 12 408 байт разницы на пустом месте. То же проверено на vanilla подменой
   * пути на розин: 181 160 → 191 882 байта, +120 классов.
   *
   * Чем это плохо: бандл превью НЕ ВОСПРОИЗВОДИМ — один и тот же коммит даёт
   * разный CSS в зависимости от того, собирали ли тему рядом. А компоненты
   * дизайн-системы темы реально импортируют (у vanilla — Header, LoginDrawer,
   * SocialIcon), значит в превью они приезжают недокрашенными.
   *
   * Почему не чиню здесь: правка касается четырёх тем сразу, а сдвиг вида
   * нужно принимать по замеру в браузере — этого объёма в задаче не было.
   * Тест пиннит ТЕКУЩЕЕ состояние: любая правка пути станет видна и заставит
   * убрать этот абзац вместе с долгом.
   */
  describe("5) путь к дизайн-системе одинаков у пяти тем (ДОЛГ: нет)", () => {
    it("четыре темы сканируют собственные node_modules вместо корневых", () => {
      const paths: Record<string, string[]> = {};
      for (const theme of THEMES) {
        const css = readFileSync(
          join(SITES_ROOT, "themes", theme, "src", "styles", "global.css"),
          "utf8",
        );
        paths[theme] = [...css.matchAll(/@source\s+"([^"]*design-systems-theme[^"]*)"/g)]
          .map((m) => m[1].replace(/@merfy-dropshipping-platform\/.*$/, "…"));
      }
      expect(paths).toEqual({
        rose: ["../../../../node_modules/…"],
        vanilla: ["../../node_modules/…"],
        flux: ["../../node_modules/…"],
        bloom: ["../../node_modules/…"],
        satin: ["../../node_modules/…"],
      });
    });
  });

  describe("4) записанный долг ещё на месте", () => {
    for (const d of KNOWN_DEBT) {
      it(`${d.theme}: призрак ${d.cls} ещё не починен (${d.where})`, () => {
        const bundle = bundleClasses(bundlePath(d.theme));
        const can = tailwindCanGenerate(d.theme, [d.cls]);
        expect({
          генерится: can.has(d.cls),
          вБандле: bundle.has(d.cls),
        }).toEqual({ генерится: true, вБандле: false });
      });
    }
  });
});
