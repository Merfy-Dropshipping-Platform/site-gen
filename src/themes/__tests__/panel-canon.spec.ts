/**
 * Гард канона: состав параметров секций менять нельзя.
 *
 * Владелец, 2026-09-13 — дословно: «Ты постоянно создаёшь параметры секций,
 * которых нет и не должно быть в принципе. <…> Нужно чётко зафиксировать,
 * проверять и бить по рукам, если создаётся то, чего не должно быть. Есть
 * секции, определённые настройки и параметры — они и должны быть. Нельзя их
 * менять ни в коем случае, ни при каких обстоятельствах».
 *
 * Это правило нарушалось не по злому умыслу, а потому что проверять было
 * нечем: панель собирается из puckConfig ТЕМЫ, лишнее поле видно только на
 * экране конструктора, и замечал его тестер. Здесь состав зафиксирован
 * снимком (conformance/panel-canon.json) и сверяется на каждом прогоне CI.
 *
 * Что именно сторожим — по каждой из пяти тем и каждому блоку:
 *   • набор блоков и их подписи;
 *   • набор полей, их порядок, тип, подпись;
 *   • видимость: 'panel' (контрол в панели секции), 'subpanel'
 *     (hiddenInMainPanel — перенесён в подпанель дерева), 'off'
 *     (type: 'hidden' — контрола нет нигде), 'never' (условие показа, которое
 *     панель не может выполнить, — такого поля не бывает, см. проверку ниже);
 *   • опции select/radio — «убрали одну опцию» это тоже изменение состава;
 *   • потолок списка (`max`) — им конструктор запрещает добавить лишний элемент;
 *   • вложенные поля элементов списка (arrayFields) и объектов (objectFields).
 *
 * Чем снимок НЕ является. Источник истины по составу панелей — макеты Figma.
 * conformance/panel-canon.json снят ЗАМЕРОМ сегодняшнего состояния: доступа к
 * макетам у автора не было (нет FIGMA_API_KEY ни в .env.local, ни в окружении;
 * локальный docs/078-theme-system/figma-inventory.json описывает кадры витрины,
 * а не сайдбары конструктора). Поэтому панели, про которые владелец уже сказал
 * «здесь будет правка по макету», перечислены в
 * conformance/panel-canon.pending.json: их сегодняшний состав эталоном НЕ
 * является, и гард говорит об этом прямо в тексте отказа.
 *
 * Чего этот гард НЕ ловит (сказано честно, чтобы на него не полагались шире):
 *   • хардкод самого конструктора — панели, которые он рисует мимо puckConfig
 *     (спецкейсы CustomFieldsPanel, NAMED_SUBSECTIONS дерева, экран «Настройки
 *     темы»). Они живут в другом репозитории;
 *   • значения по умолчанию — это предмет test:panel-defaults;
 *   • то, что поле реально доезжает до витрины — это предмет
 *     test:hidden-fields и снимков секций.
 *
 * Требует собранного dist: pnpm build && pnpm build:blocks.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CANON_DUMP = resolve(__dirname, "panel-canon.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const CANON_FILE = resolve(SITES_ROOT, "conformance", "panel-canon.json");
const PENDING_FILE = resolve(
  SITES_ROOT,
  "conformance",
  "panel-canon.pending.json",
);
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

const HOW_TO_FIX = [
  "",
  "Состав параметров секций менять нельзя (владелец, 2026-09-13).",
  "Если изменение НАМЕРЕННОЕ — пересними канон `pnpm panel-canon:refresh`",
  "ОТДЕЛЬНЫМ коммитом и объясни в нём, кто и зачем разрешил.",
  `Канон: ${"conformance/panel-canon.json"}`,
].join("\n");

type FieldCanon = {
  type: string | null;
  label: string;
  visibility: "panel" | "subpanel" | "off" | "never";
  options?: string[];
  max?: number;
  min?: number;
  itemFields?: Record<string, FieldCanon>;
  objectFields?: Record<string, FieldCanon>;
};
type BlockCanon = { label: string; fields: Record<string, FieldCanon> };
type ThemeCanon = Record<string, BlockCanon>;
type PendingEntry = {
  id: string;
  scope: "panel-canon" | "constructor" | "defaults";
  block?: string;
  field?: string;
  title: string;
  ownerWords: string;
  whoFixes?: string;
};

const VISIBILITY_RU: Record<string, string> = {
  panel: "контрол в панели секции",
  subpanel: "контрол в подпанели дерева (hiddenInMainPanel)",
  off: "контрола нет нигде (type: hidden)",
  never:
    "контрола нет: условие показа ссылается на поле, которого рядом нет (visibleWhen)",
};

function describe1(f: FieldCanon): string {
  return `${f.type}, «${f.label}», ${VISIBILITY_RU[f.visibility] ?? f.visibility}`;
}

/** Расхождения по одному полю. `path` — путь вида `items › url`. */
function fieldDiff(path: string, was: FieldCanon, now: FieldCanon): string[] {
  const out: string[] = [];
  if (was.type !== now.type)
    out.push(`• ${path}: тип «${was.type}» → «${now.type}»`);
  if (was.label !== now.label)
    out.push(`• ${path}: подпись «${was.label}» → «${now.label}»`);
  if (was.visibility !== now.visibility) {
    out.push(
      `• ${path}: видимость «${VISIBILITY_RU[was.visibility]}» → «${VISIBILITY_RU[now.visibility]}»`,
    );
  }
  const wasOpt = was.options ?? null;
  const nowOpt = now.options ?? null;
  if (JSON.stringify(wasOpt) !== JSON.stringify(nowOpt)) {
    const gone = (wasOpt ?? []).filter((o) => !(nowOpt ?? []).includes(o));
    const added = (nowOpt ?? []).filter((o) => !(wasOpt ?? []).includes(o));
    if (gone.length) out.push(`• ${path}: ИСЧЕЗЛИ опции ${gone.join(", ")}`);
    if (added.length)
      out.push(`• ${path}: ПОЯВИЛИСЬ опции ${added.join(", ")}`);
    if (!gone.length && !added.length)
      out.push(`• ${path}: изменился порядок опций`);
  }
  if (was.max !== now.max)
    out.push(`• ${path}: потолок списка ${was.max ?? "—"} → ${now.max ?? "—"}`);
  if (was.min !== now.min)
    out.push(`• ${path}: минимум списка ${was.min ?? "—"} → ${now.min ?? "—"}`);
  out.push(
    ...nestedDiff(
      `${path} › `,
      was.itemFields,
      now.itemFields,
      "элемента списка",
    ),
  );
  out.push(
    ...nestedDiff(`${path} › `, was.objectFields, now.objectFields, "объекта"),
  );
  return out;
}

function nestedDiff(
  prefix: string,
  was: Record<string, FieldCanon> | undefined,
  now: Record<string, FieldCanon> | undefined,
  what: string,
): string[] {
  if (!was && !now) return [];
  if (!was)
    return [
      `• ${prefix.trim()} ПОЯВИЛИСЬ поля ${what}: ${Object.keys(now ?? {}).join(", ")}`,
    ];
  if (!now)
    return [
      `• ${prefix.trim()} ИСЧЕЗЛИ поля ${what}: ${Object.keys(was).join(", ")}`,
    ];
  return fieldsDiff(prefix, was, now);
}

function fieldsDiff(
  prefix: string,
  was: Record<string, FieldCanon>,
  now: Record<string, FieldCanon>,
): string[] {
  const out: string[] = [];
  for (const [name, f] of Object.entries(now)) {
    if (!(name in was))
      out.push(`• ${prefix}${name}: ПОЯВИЛОСЬ поле (${describe1(f)})`);
  }
  for (const [name, f] of Object.entries(was)) {
    if (!(name in now))
      out.push(`• ${prefix}${name}: ИСЧЕЗЛО поле (было ${describe1(f)})`);
  }
  for (const [name, f] of Object.entries(was)) {
    if (name in now) out.push(...fieldDiff(`${prefix}${name}`, f, now[name]));
  }
  // Порядок полей = порядок контролов на экране. Сравниваем только по общим
  // именам, иначе добавленное поле выдало бы «порядок» вдобавок к «появилось».
  const wasOrder = Object.keys(was).filter((k) => k in now);
  const nowOrder = Object.keys(now).filter((k) => k in was);
  if (JSON.stringify(wasOrder) !== JSON.stringify(nowOrder)) {
    out.push(
      `• порядок полей: ${wasOrder.join(" → ")} стал ${nowOrder.join(" → ")}`,
    );
  }
  return out;
}

function fail(
  theme: string,
  block: string,
  blockLabel: string,
  lines: string[],
  pendingHere: PendingEntry[],
): string {
  // Место, про которое владелец уже сказал «здесь будет правка по макету»,
  // отказывается по-другому: «нельзя» сбило бы с толку того, кто эту правку и
  // делает. Гард всё равно красный — молча такое пропускать нельзя.
  const tail = pendingHere.length
    ? [
        "",
        "ЭТО МЕСТО ПОМЕЧЕНО «ОЖИДАЕТСЯ ПРАВКА ПО МАКЕТУ» — сегодняшний состав",
        "здесь НЕ эталон (conformance/panel-canon.pending.json):",
        ...pendingHere.flatMap((e) => [
          `  • ${e.id} — ${e.title}`,
          `    со слов владельца: «${e.ownerWords}»`,
        ]),
        "",
        "Если ты и есть эта правка — пересними канон `pnpm panel-canon:refresh`,",
        "сошлись в коммите на макет Figma и убери запись из pending-файла.",
        "Если нет — состав менять нельзя, верни как было.",
        "Канон: conformance/panel-canon.json",
      ].join("\n")
    : HOW_TO_FIX;
  return [
    "",
    "Состав параметров секции изменился — так нельзя.",
    "",
    `  тема:  ${theme}`,
    `  блок:  ${block} («${blockLabel}»)`,
    "",
    ...lines.map((l) => `  ${l}`),
    tail,
  ].join("\n");
}

const canonExists = existsSync(CANON_FILE);
const distReady = existsSync(
  resolve(
    SITES_ROOT,
    "dist",
    "src",
    "controllers",
    "theme-puck-config.controller.js",
  ),
);

const canon: Record<string, ThemeCanon> = canonExists
  ? JSON.parse(readFileSync(CANON_FILE, "utf-8")).themes
  : {};

const pendingExists = existsSync(PENDING_FILE);
const pendingDoc: { verifiedAgainstFigma?: boolean; entries?: PendingEntry[] } =
  pendingExists ? JSON.parse(readFileSync(PENDING_FILE, "utf-8")) : {};
const pendingEntries: PendingEntry[] = pendingDoc.entries ?? [];
const pendingForBlock = (block: string) =>
  pendingEntries.filter((e) => e.scope === "panel-canon" && e.block === block);

const actual: Record<string, ThemeCanon> = {};

beforeAll(() => {
  if (!distReady) return;
  // Один дочерний процесс на все темы: контроллер грузит ESM-модули блоков,
  // в jest (CJS) их не импортировать — та же причина, что у соседних .mjs.
  const raw = execFileSync("node", [CANON_DUMP], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  Object.assign(actual, JSON.parse(raw).themes);
}, 300_000);

describe("канон состава параметров секций", () => {
  it("снимок канона лежит в репозитории (conformance/panel-canon.json)", () => {
    expect(canonExists).toBe(true);
  });

  it("dist собран (pnpm build && pnpm build:blocks)", () => {
    expect(distReady).toBe(true);
  });

  it("канон покрывает все пять тем", () => {
    if (!canonExists) return;
    expect(Object.keys(canon).sort()).toEqual([...THEMES].sort());
  });
});

/**
 * Список «ожидается правка по макету» обязан оставаться честным: пока в нём
 * есть записи, снимок нельзя выдавать за эталон. Эти проверки не дают ему
 * протухнуть — записи, указывающие на несуществующий блок или поле, ввели бы в
 * заблуждение сильнее, чем их отсутствие.
 */
describe("панели, не сверенные с макетом Figma", () => {
  it("список ожидаемых правок лежит рядом с каноном", () => {
    expect(pendingExists).toBe(true);
  });

  it("снимок честно помечен как НЕ сверенный с макетом", () => {
    if (!pendingExists) return;
    // Пока хоть одна запись открыта, verifiedAgainstFigma обязан быть false:
    // иначе канон читается как выписка из макета, которой он не является.
    if (pendingEntries.length > 0) {
      expect(pendingDoc.verifiedAgainstFigma).toBe(false);
    }
  });

  it.each(pendingEntries.map((e) => [e.id, e] as const))(
    "%s — запись заполнена и указывает на существующее место",
    (_id, entry) => {
      expect(entry.title).toBeTruthy();
      expect(entry.ownerWords).toBeTruthy();
      expect(["panel-canon", "constructor", "defaults"]).toContain(entry.scope);
      if (entry.scope !== "panel-canon") return;
      // Блок и поле обязаны существовать во ВСЕХ пяти темах — иначе пометка
      // висит над пустотой, и правка пройдёт мимо неё.
      expect(entry.block).toBeTruthy();
      for (const theme of THEMES) {
        const block = canon[theme]?.[entry.block as string];
        expect(block).toBeDefined();
        if (entry.field)
          expect(Object.keys(block.fields)).toContain(entry.field);
      }
    },
  );
});

/** Пути полей с видимостью 'never' — вглубь объектов и элементов списков. */
function спрятаныНавсегда(
  prefix: string,
  fields: Record<string, FieldCanon> | undefined,
): string[] {
  return Object.entries(fields ?? {}).flatMap(([name, f]) => [
    ...(f.visibility === "never" ? [`${prefix}${name}`] : []),
    ...спрятаныНавсегда(`${prefix}${name} › `, f.objectFields),
    ...спрятаныНавсегда(`${prefix}${name} › `, f.itemFields),
  ]);
}

/**
 * Поле с условием показа, которое панель выполнить не может, для мерчанта не
 * существует — а в каноне и в коде тем выглядит живым. 23.09 так прятался
 * «Режим следующего фото» (`visibleWhen: { field: 'productCard.nextPhoto' }`):
 * порты его слушались, сторожа были зелёными, тестер переключателя не видел, и
 * листания в bloom/vanilla у него не было. Условие в objectFields называет
 * СОСЕДНЕЕ поле по имени — так его читает ObjectField.tsx конструктора.
 */
describe.each(THEMES)("условия показа выполнимы — %s", (theme) => {
  it("ни одно поле не спрятано навсегда условием показа", () => {
    if (!distReady) return;
    const спрятаны = Object.entries(actual[theme] ?? {}).flatMap(
      ([block, def]) => спрятаныНавсегда(`${block} › `, def.fields),
    );
    expect(спрятаны).toEqual([]);
  });
});

describe.each(THEMES)("канон — %s", (theme) => {
  it("набор секций совпадает с каноном", () => {
    if (!canonExists || !distReady) return;
    const was = Object.keys(canon[theme] ?? {});
    const now = Object.keys(actual[theme] ?? {});
    const added = now.filter((b) => !was.includes(b));
    const gone = was.filter((b) => !now.includes(b));
    if (added.length || gone.length) {
      throw new Error(
        [
          "",
          "Набор секций темы изменился — так нельзя.",
          "",
          `  тема: ${theme}`,
          "",
          ...added.map((b) => `  • ${b}: ПОЯВИЛАСЬ секция`),
          ...gone.map((b) => `  • ${b}: ИСЧЕЗЛА секция`),
          HOW_TO_FIX,
        ].join("\n"),
      );
    }
    expect(now).toEqual(was);
  });

  // Канон читается на этапе сбора тестов, поэтому блоки перечисляем из него:
  // блок, исчезнувший из кода, поймает проверка выше, а этот it даст точное
  // имя поля, если состав внутри блока поехал.
  const blocks = canonExists ? Object.keys(canon[theme] ?? {}) : [];
  for (const block of blocks) {
    it(`${block} — состав параметров как в каноне`, () => {
      if (!distReady) return;
      const was = canon[theme][block];
      const now = actual[theme]?.[block];
      if (!now) return; // исчезнувший блок — забота проверки выше
      const lines: string[] = [];
      if (was.label !== now.label) {
        lines.push(`• подпись секции «${was.label}» → «${now.label}»`);
      }
      lines.push(...fieldsDiff("", was.fields, now.fields));
      if (lines.length)
        throw new Error(
          fail(theme, block, was.label, lines, pendingForBlock(block)),
        );
      expect(now).toEqual(was);
    });
  }
});
