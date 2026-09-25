#!/usr/bin/env tsx
/**
 * Зонды замеров — из командной строки.
 *
 * Библиотека: scripts/qa/lib (ловушки и почему они так обойдены — в её README).
 * Ни один подкоманд не возвращает 0, если проверено НОЛЬ клеток.
 *
 *   pnpm qa:probe schemes  --theme flux
 *   pnpm qa:probe schemes  --url https://<стенд>
 *   pnpm qa:probe color    --url https://<стенд> --marker block:cart-body --prop background-color
 *   pnpm qa:probe color    --theme flux --block CartBody --marker block:cart-body --scheme 2
 *   pnpm qa:probe scheme   --theme flux --block CartBody --marker block:cart-body \
 *                          --prop background-color --schemes 1,4 --role --color-bg
 *   pnpm qa:probe scheme   --url https://<стенд> --marker block:cart-body --schemes 1,2 --role --color-bg
 *   pnpm qa:probe phantom  --theme flux --class flux-container
 *   pnpm qa:probe phantom  --theme flux --block Product --marker attr:data-cfg-name
 *   pnpm qa:probe geometry --url https://<стенд> --marker css:.flux-container
 *   pnpm qa:probe geometry --theme flux --block Product --marker css:.flux-container-designers --vs rose
 *   pnpm qa:probe reveal   --url https://<стенд> --what search --marker "#header-search-panel"
 */
import {
  ProbeReport,
  bundleClassNames,
  classesOfMarker,
  closeBrowser,
  fetchTokensCss,
  followsSchemeLocal,
  followsSchemeOnLive,
  listSchemes,
  markerSelector,
  openStage,
  phantomClasses,
  probeColor,
  probeGeometry,
  probeOverflow,
  renderBlock,
  reveal,
  ROLES,
  schemeNum,
  schemeRoles,
  themeCss,
  tokensCssFor,
  type RevealName,
  type Stage,
} from "./lib";

type Args = Record<string, string | undefined>;

function parseArgs(argv: string[]): { cmd: string; args: Args } {
  const [cmd = "", ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > 2) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    // Значение может само начинаться с «--» (роли схемы: --role --color-bg),
    // поэтому следующий токен берётся как значение без «умных» догадок.
    args[token.slice(2)] = rest[i + 1];
    i += 1;
  }
  return { cmd, args };
}

const need = (args: Args, key: string): string => {
  const v = args[key];
  if (!v) throw new Error(`не хватает --${key}`);
  return v;
};

const num = (v: string | undefined, def: number): number =>
  v === undefined ? def : Number.parseInt(v, 10);

const jsonProps = (v: string | undefined): Record<string, unknown> =>
  v ? (JSON.parse(v) as Record<string, unknown>) : {};

async function stageFor(args: Args): Promise<Stage> {
  const width = num(args.width, 1440);
  const height = num(args.height, 1600);
  if (args.url) return openStage({ kind: "live", url: args.url, width, height });
  return openStage({
    kind: "local",
    theme: need(args, "theme"),
    blocks: [{ block: need(args, "block"), props: jsonProps(args.props) }],
    schemeId: args.scheme ?? null,
    width,
    height,
  });
}

async function cmdSchemes(args: Args): Promise<number> {
  const tokensCss = args.url
    ? await fetchTokensCss(args.url)
    : tokensCssFor(need(args, "theme"));
  const wanted = args.schemes ? args.schemes.split(",").map(schemeNum) : listSchemes(tokensCss);
  const report = new ProbeReport(
    `схемы магазина: ${args.url ?? args.theme}`,
    ["схема", "роль", "тройка", "rgb"],
  );
  for (const id of wanted) {
    for (const role of schemeRoles(tokensCss, id, ROLES)) {
      report.cell({
        схема: id,
        роль: role.token,
        тройка: role.triple,
        rgb: role.rgb ?? "НЕТ В СХЕМЕ",
      });
    }
  }
  return report.finish();
}

async function cmdColor(args: Args): Promise<number> {
  const marker = need(args, "marker");
  const prop = args.prop ?? "background-color";
  const stage = await stageFor(args);
  try {
    const probe = await probeColor(stage, marker, prop);
    const report = new ProbeReport(`цвет мишени ${markerSelector(marker)} · ${stage.label}`, [
      "шаг",
      "узел",
      "классы",
      "фон",
      "непрозрачный",
    ]);
    if (!probe.found) {
      process.stdout.write(`мишень ${markerSelector(marker)} на странице НЕ НАЙДЕНА\n`);
      return 1;
    }
    if (probe.matched > 1) {
      process.stdout.write(
        `ВНИМАНИЕ: маркер неоднозначен — совпало узлов: ${probe.matched}. ` +
          "Меряется первый; уточните маркер или проверьте все узлы.\n",
      );
    }
    process.stdout.write(
      `${prop} на мишени: ${probe.value}\n` +
        `что видит глаз (первая непрозрачная заливка): ${probe.effective ?? "нет вовсе"} (${probe.painter ?? "—"})\n`,
    );
    for (const s of probe.chain) {
      report.cell({
        шаг: s.step,
        узел: s.id ? `${s.tag}#${s.id}` : s.tag,
        классы: s.cls.slice(0, 60),
        фон: s.backgroundColor,
        непрозрачный: s.opaque ? "да" : "",
      });
    }
    return report.finish();
  } finally {
    await stage.close();
  }
}

async function cmdScheme(args: Args): Promise<number> {
  const marker = need(args, "marker");
  const prop = args.prop ?? "background-color";
  const role = need(args, "role");
  const [a, b] = (args.schemes ?? "1,4").split(",").map(schemeNum);
  const report = new ProbeReport("едет ли мишень за схемой", [
    "мишень",
    "свойство",
    "роль",
    `схема ${a}`,
    `схема ${b}`,
    "вердикт",
    "берёт роль",
    "почему",
  ]);
  const add = (r: Awaited<ReturnType<typeof followsSchemeLocal>>) =>
    report.cell({
      мишень: r.marker,
      свойство: r.prop,
      роль: r.role,
      [`схема ${a}`]: r.valueA,
      [`схема ${b}`]: r.valueB,
      вердикт: r.verdict,
      "берёт роль": r.matchesRole === null ? "—" : r.matchesRole ? "да" : "нет",
      почему: r.why,
    });

  if (args.url) {
    const stage = await openStage({
      kind: "live",
      url: args.url,
      width: num(args.width, 1440),
      height: num(args.height, 1600),
    });
    try {
      add(await followsSchemeOnLive(stage, { marker, prop, a, b, role }));
    } finally {
      await stage.close();
    }
  } else {
    add(
      await followsSchemeLocal({
        theme: need(args, "theme"),
        block: need(args, "block"),
        marker,
        prop,
        a,
        b,
        role,
        props: jsonProps(args.props),
        width: num(args.width, 1440),
        height: num(args.height, 1600),
      }),
    );
  }
  return report.finish({ bad: (r) => r["вердикт"] !== "едет" });
}

function cmdPhantom(args: Args): number {
  const theme = need(args, "theme");
  const css = themeCss(theme);
  const classes = args.class
    ? args.class.split(/[\s,]+/).filter(Boolean)
    : classesOfMarker(
        renderBlock(theme, need(args, "block"), jsonProps(args.props)),
        need(args, "marker"),
      );
  const phantom = new Set(phantomClasses(css, classes));
  const known = bundleClassNames(css);
  const report = new ProbeReport(`классы-призраки в dist/theme-css/${theme}.css`, [
    "класс",
    "в бандле темы",
    "вердикт",
  ]);
  for (const cls of classes) {
    report.cell({
      класс: cls,
      "в бандле темы": known.has(cls) ? "есть" : "НЕТ",
      вердикт: phantom.has(cls) ? "ПРИЗРАК" : known.has(cls) ? "живой" : "маркер (не утилита)",
    });
  }
  return report.finish({ bad: (r) => r["вердикт"] === "ПРИЗРАК" });
}

async function cmdGeometry(args: Args): Promise<number> {
  const marker = need(args, "marker");
  const stage = await stageFor(args);
  const report = new ProbeReport(`геометрия ${markerSelector(marker)}`, [
    "клетка",
    "значение",
    "эталон",
    "совпало",
  ]);
  try {
    const g = await probeGeometry(stage, marker);
    if (g.matched > 1) {
      process.stdout.write(
        `ВНИМАНИЕ: маркер неоднозначен — совпало узлов: ${g.matched}. Меряется первый.\n`,
      );
    }
    if (!g.found) {
      process.stdout.write(`мишень ${markerSelector(marker)} на странице НЕ НАЙДЕНА\n`);
      return 1;
    }
    const over = await probeOverflow(stage, marker);
    let ref: Awaited<ReturnType<typeof probeGeometry>> | null = null;
    if (args.vs) {
      const refStage = await openStage({
        kind: "local",
        theme: args.vs,
        blocks: [{ block: need(args, "block"), props: jsonProps(args.props) }],
        schemeId: args.scheme ?? null,
        width: num(args.width, 1440),
        height: num(args.height, 1600),
      });
      try {
        ref = await probeGeometry(refStage, marker);
      } finally {
        await refStage.close();
      }
    }
    const keys = [
      "x",
      "width",
      "height",
      "paddingLeft",
      "paddingRight",
      "paddingTop",
      "paddingBottom",
      "maxWidth",
      "columnGap",
      "rowGap",
      "display",
      "gridTemplateColumns",
    ] as const;
    for (const k of keys) {
      const mine = g[k];
      const theirs = ref ? ref[k] : null;
      report.cell({
        клетка: k,
        значение: mine,
        эталон: ref ? theirs : "—",
        совпало: ref ? (JSON.stringify(mine) === JSON.stringify(theirs) ? "да" : "НЕТ") : "—",
      });
    }
    report.cell({
      клетка: "переполнение вправо (опора — ЗАДАННАЯ ширина окна)",
      значение: `${over.overRight} px при опоре ${over.reference}`,
      эталон: "—",
      совпало: over.overRight !== null && over.overRight > 0.5 ? "НЕТ" : "да",
    });
    return report.finish({ bad: (r) => r["совпало"] === "НЕТ" });
  } finally {
    await stage.close();
  }
}

async function cmdReveal(args: Args): Promise<number> {
  const what = need(args, "what") as RevealName;
  const stage = await stageFor(args);
  try {
    const res = await reveal(stage, what);
    const report = new ProbeReport(`открыть «${what}» на ${stage.label}`, [
      "селектор",
      "кликнули",
      "панель видна",
    ]);
    process.stdout.write(
      `открыто: ${res.opened ? "да" : "НЕТ"}; чем: ${res.via ?? "—"}; панель: ${res.panel ?? "—"}\n` +
        `${res.why}\n`,
    );
    for (const t of res.tried) {
      report.cell({
        селектор: t.selector,
        кликнули: t.clicked ? "да" : "нет",
        "панель видна": t.visible ? "да" : "нет",
      });
    }
    if (res.opened && res.tried.length === 0) {
      report.cell({ селектор: res.panel ?? "—", кликнули: "не понадобилось", "панель видна": "да" });
    }
    if (res.opened && args.marker) {
      const probe = await probeColor(stage, args.marker, args.prop ?? "background-color");
      process.stdout.write(
        `\nмишень ${markerSelector(args.marker)}: ${args.prop ?? "background-color"} = ${probe.value}, ` +
          `видимая заливка ${probe.effective ?? "нет"} (${probe.painter ?? "—"})\n`,
      );
    }
    return report.finish({ bad: () => !res.opened });
  } finally {
    await stage.close();
  }
}

const USAGE = `зонды замеров — pnpm qa:probe <команда> [опции]

команды:
  schemes   какие цвета лежат в схемах магазина (--theme | --url)
  color     цвет мишени + ЦЕПОЧКА предков с их фонами
  scheme    едет ли мишень за схемой: едет / замерла / неразличимо
  phantom   есть ли класс в СОБСТВЕННОМ бандле темы
  geometry  x, ширина, паддинги, зазоры (+ --vs rose для сравнения с эталоном)
  reveal    открыть скрытое (search | cart | added | menu) и проверить, что открылось

опции: --theme --block --url --marker --prop --scheme --schemes --role --class
       --props '<json>' --width --height --vs --what

маркер: block:cart-body | attr:data-cfg-name | attr:data-nt=promo-banner | #cart-title | css:.flux-container
`;

async function main(): Promise<void> {
  const { cmd, args } = parseArgs(process.argv.slice(2));
  let code = 0;
  switch (cmd) {
    case "schemes":
      code = await cmdSchemes(args);
      break;
    case "color":
      code = await cmdColor(args);
      break;
    case "scheme":
      code = await cmdScheme(args);
      break;
    case "phantom":
      code = cmdPhantom(args);
      break;
    case "geometry":
      code = await cmdGeometry(args);
      break;
    case "reveal":
      code = await cmdReveal(args);
      break;
    default:
      process.stdout.write(USAGE);
      code = cmd ? 2 : 0;
  }
  await closeBrowser();
  process.exit(code);
}

main().catch(async (e) => {
  await closeBrowser();
  process.stderr.write(`${(e as Error).message}\n`);
  process.exit(1);
});
