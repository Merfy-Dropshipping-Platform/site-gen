/**
 * Секция «Изображение» (блок Hero) — сколько медиа показывает и когда делится.
 *
 * Панель даёт ДВА слота «Добавить фото» (канон `backgroundImages` типа
 * `imagePair`, см. conformance/panel-canon.json — поле есть во всех пяти темах).
 * Контракт поведения задан эталоном **rose**:
 *
 *   • ни одного фото  → медиа мерчанта нет, деления нет (пустое состояние темы);
 *   • ОДНО фото       → оно показывается ЦЕЛИКОМ, деления нет — неважно, в какой
 *                       слот его положили (первый или второй);
 *   • ДВА фото        → блок делится, показаны ОБА.
 *
 * Баг, который сторожит этот файл (отчёт владельца, тема satin): при одном фото
 * во ВТОРОМ слоте satin подставлял в первый кадр дизайн-плейсхолдер
 * `/placeholders/landscape-image.png` и делил фото-зону пополам — мерчант видел
 * «как будто медиа два», причём половина чужая. Причина: гейт сплита считался
 * по значению, в которое плейсхолдер УЖЕ подставлен (у rose/bloom/flux он
 * считается по сырому пропсу мерчанта). Второй дефект того же класса: vanilla
 * не читала второй слот вообще — одно фото во втором слоте пропадало.
 *
 * Проверяем РЕНДЕРОМ настоящего скомпилированного модуля темы (того, что уходит
 * на витрину и в превью) через ПОЛНУЮ живую цепочку рантайма (`live`:
 * adaptLegacyProps → blockDefaults темы → resolveBlockProps) — ровно её проходят
 * все три пути рендера: сборка витрины (v2-live-pages → renderBlock), точечный
 * hot-render конструктора (POST /preview/block) и превью страницы.
 *
 * Требует собранных секций: pnpm build:theme-sections:all (+ pnpm build для dist/src).
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Узнаваемые URL мерчанта — по ним считаем «настоящие» кадры. */
const M1 = "https://cdn.example.test/merchant-one.jpg";
const M2 = "https://cdn.example.test/merchant-two.jpg";

type Case = {
  name: string;
  props: Record<string, unknown>;
  /** Сколько кадров мерчанта обязано быть в разметке. */
  expected: string[];
};

const CASES: Case[] = [
  { name: "0 медиа", props: {}, expected: [] },
  { name: "1 медиа — слот 1", props: { backgroundImages: { url1: M1 } }, expected: [M1] },
  { name: "1 медиа — слот 2", props: { backgroundImages: { url2: M2 } }, expected: [M2] },
  {
    name: "1 медиа — слот 2, первый пустой строкой",
    props: { backgroundImages: { url1: "", url2: M2 } },
    expected: [M2],
  },
  {
    name: "2 медиа",
    props: { backgroundImages: { url1: M1, url2: M2 } },
    expected: [M1, M2],
  },
  { name: "легаси 1 медиа — backgroundImage", props: { backgroundImage: M1 }, expected: [M1] },
  { name: "легаси 1 медиа — backgroundImage2", props: { backgroundImage2: M2 }, expected: [M2] },
  {
    name: "легаси 2 медиа",
    props: { backgroundImage: M1, backgroundImage2: M2 },
    expected: [M1, M2],
  },
];

function blockProps(extra: Record<string, unknown>) {
  return {
    id: "Hero-1",
    colorScheme: "1",
    size: "large",
    overlay: 0,
    heading: { text: "Изображение", size: "medium" },
    text: { content: "Покажи и расскажи о своем товаре в одном блоке", size: "medium" },
    primaryButton: { text: "Кнопка", link: { href: "/catalog" } },
    padding: { top: 0, bottom: 0 },
    ...extra,
  };
}

function render(theme: string, cases: Case[]): string[] {
  const jobs = cases.map((c) => ({
    block: "Hero",
    props: blockProps(c.props),
    cascade: true,
    live: true,
  }));
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return (
    JSON.parse(raw) as {
      html?: string;
      error?: string;
      pipelineError?: string;
      missing?: boolean;
    }[]
  ).map((r) =>
    r.missing
      ? "MISSING"
      : r.error || r.pipelineError
        ? `ERROR:${r.error ?? r.pipelineError}`
        : (r.html ?? ""),
  );
}

/**
 * Все медиа-узлы секции: `<img src>`, `srcset` первой записи и
 * CSS `background-image: url(...)`. Темы рисуют фон по-разному (rose/satin/flux
 * — `<picture><img>`, часть тем — фон через style), поэтому считаем оба вида.
 */
function mediaUrls(html: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<img\b[^>]*>/g) ?? []) {
    const src = /\bsrc=(["'])(.*?)\1/.exec(tag)?.[2];
    if (src) {
      out.push(src);
      continue;
    }
    const first = /\bsrcset=(["'])(.*?)\1/.exec(tag)?.[2]?.split(",")[0]?.trim().split(/\s+/)[0];
    if (first) out.push(first);
  }
  for (const m of html.matchAll(/background-image:\s*url\((["']?)([^"')]+)\1\)/g)) out.push(m[2]);
  return out;
}

const merchantUrls = (html: string) => mediaUrls(html).filter((u) => u.includes("cdn.example.test"));
/** Дизайн-плейсхолдеры/мок-фото верстальщика — всё, что мерчант не выбирал. */
const foreignUrls = (html: string) =>
  mediaUrls(html).filter((u) => !u.includes("cdn.example.test"));

describe.each(THEMES)("Секция «Изображение» — слоты медиа, тема %s", (theme) => {
  const built = existsSync(resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"));

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built).toBe(true);
  });

  if (!built) return;

  const htmls = render(theme, CASES);

  it.each(CASES.map((c, i) => [c.name, i] as const))(
    "%s — рендер без ошибок",
    (_name, i) => {
      expect(htmls[i]).not.toMatch(/^ERROR:/);
      expect(htmls[i]).not.toBe("MISSING");
      // Страховка от ложно-зелёного: пустая разметка прошла бы все счётные проверки.
      expect(htmls[i].length).toBeGreaterThan(200);
    },
  );

  it.each(CASES.map((c, i) => [c.name, i] as const))(
    "%s — показаны ровно выбранные мерчантом кадры",
    (_name, i) => {
      const c = CASES[i];
      const got = merchantUrls(htmls[i]);
      expect(got).toHaveLength(c.expected.length);
      for (const url of c.expected) expect(got).toContain(url);
    },
  );

  it.each(
    CASES.filter((c) => c.expected.length > 0).map((c) => [c.name, CASES.indexOf(c)] as const),
  )("%s — ни одного чужого кадра рядом с фото мерчанта", (_name, i) => {
    // Именно этим баг и выглядел: /placeholders/landscape-image.png занимал
    // половину блока рядом с единственным фото мерчанта.
    expect(foreignUrls(htmls[i])).toEqual([]);
  });
});
